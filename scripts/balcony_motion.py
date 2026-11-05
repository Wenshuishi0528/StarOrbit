"""On-demand local MacBook attitude, using only the two IMU devices.

The stream contains coarse viewing angles, never raw reports. Devices and their
previous reporting settings are released when the browser disconnects.
"""
import ctypes as C
import math
import struct
import sys
import threading
import time
from contextlib import ExitStack

_active = threading.Lock()
_USAGES = {3: 'accel', 9: 'gyro'}


def view_angles(gravity, rotation, elapsed):
    """Chassis forward = +Y, right = +X, up = +Z. North is user-aligned."""
    length = math.hypot(*gravity)
    if not 0.35 < length < 1.75:
        return None
    x, y, z = (v / length for v in gravity)
    yaw_step = sum(a * b for a, b in zip((x, y, z), rotation)) * elapsed
    pitch = math.degrees(math.asin(max(-1, min(1, -y))))
    roll = math.degrees(math.atan2(x, -z))
    return yaw_step, pitch, roll


def _poses(stop_after=None):
    if sys.platform != 'darwin':
        yield {'error': 'unsupported'}
        return
    P, U, L, N = C.c_void_p, C.c_uint32, C.c_long, C.c_int32
    cf = C.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
    io = C.CDLL('/System/Library/Frameworks/IOKit.framework/IOKit')
    def bind(lib, name, result, *args):
        fn = getattr(lib, name)
        fn.restype, fn.argtypes = result, args
        return fn
    cfstr = bind(cf, 'CFStringCreateWithCString', P, P, C.c_char_p, U)
    cfnum = bind(cf, 'CFNumberCreate', P, P, L, P)
    getnum = bind(cf, 'CFNumberGetValue', C.c_bool, P, L, P)
    release = bind(cf, 'CFRelease', None, P)
    loop = bind(cf, 'CFRunLoopGetCurrent', P)()
    mode = P.in_dll(cf, 'kCFRunLoopDefaultMode')
    run = bind(cf, 'CFRunLoopRunInMode', N, P, C.c_double, C.c_bool)
    matching = bind(io, 'IOServiceMatching', P, C.c_char_p)
    enumerate_services = bind(io, 'IOServiceGetMatchingServices', N, U, P, C.POINTER(U))
    next_item = bind(io, 'IOIteratorNext', U, U)
    io_release = bind(io, 'IOObjectRelease', N, U)
    getprop = bind(io, 'IORegistryEntryCreateCFProperty', P, U, P, P, U)
    setprop = bind(io, 'IORegistryEntrySetCFProperty', N, U, P, P)
    device = bind(io, 'IOHIDDeviceCreate', P, P, U)
    open_device = bind(io, 'IOHIDDeviceOpen', N, P, U)
    close = bind(io, 'IOHIDDeviceClose', N, P, U)
    schedule = bind(io, 'IOHIDDeviceScheduleWithRunLoop', None, P, P, P)
    unschedule = bind(io, 'IOHIDDeviceUnscheduleFromRunLoop', None, P, P, P)
    CALLBACK = C.CFUNCTYPE(None, P, N, P, N, U, C.POINTER(C.c_ubyte), L)
    register = bind(io, 'IOHIDDeviceRegisterInputReportCallback', None, P, P, L, CALLBACK, P)
    latest, stamps, buffers = {}, {}, []
    with ExitStack() as cleanup:
        def keep(value, fn):
            if value:
                cleanup.callback(fn, value)
            return value
        keys = {k: keep(cfstr(None, k.encode(), 0x08000100), release) for k in
                ('PrimaryUsagePage', 'PrimaryUsage', 'SensorPropertyReportingState', 'SensorPropertyPowerState', 'ReportInterval')}
        def number(v):
            return keep(cfnum(None, 3, C.byref(N(v))), release)
        def field(item, name):
            prop = getprop(item, keys[name], None, 0)
            if not prop:
                return 0
            val = N()
            getnum(prop, 3, C.byref(val))
            release(prop)
            return val.value
        def find(name):
            it, found = U(), {}
            if enumerate_services(0, matching(name.encode()), C.byref(it)) == 0:
                while (item := next_item(it)):
                    usage = field(item, 'PrimaryUsage')
                    if usage in _USAGES and field(item, 'PrimaryUsagePage') == 0xff00 and usage not in found:
                        found[usage] = keep(item, io_release)
                    else:
                        io_release(item)
                io_release(it)
            return found
        sensors, drivers = find('AppleSPUHIDDevice'), find('AppleSPUHIDDriver')
        if set(sensors) != set(_USAGES) or set(drivers) != set(_USAGES):
            yield {'error': 'unsupported'}
            return
        @CALLBACK
        def report(ctx, result, sender, report_type, report_id, ptr, size):
            if result or size != 22:
                return
            key = _USAGES[ctx]
            latest[key] = tuple(v / 65536. for v in struct.unpack_from('<3i', C.string_at(ptr, size), 6))
            stamps[key] = time.monotonic()
        for usage, service in sensors.items():
            ref = keep(device(None, service), release)
            if not ref or open_device(ref, 0):
                yield {'error': 'restricted'}
                return
            cleanup.callback(close, ref, 0)
            buf = (C.c_ubyte * 256)()
            buffers.append(buf)
            register(ref, buf, len(buf), report, usage)
            schedule(ref, loop, mode)
            cleanup.callback(unschedule, ref, loop, mode)
        zero = number(0)
        for driver in drivers.values():
            for name, value in [('SensorPropertyReportingState', 1), ('SensorPropertyPowerState', 1), ('ReportInterval', 20000)]:
                key = keys[name]
                previous = keep(getprop(driver, key, None, 0), release)
                if setprop(driver, key, number(value)):
                    yield {'error': 'restricted'}
                    return
                cleanup.callback(setprop, driver, key, previous or zero)
        start = last = time.monotonic()
        yaw, gravity, bias = 0., None, [0., 0., 0.]
        while stop_after is None or last - start < stop_after:
            run(mode, .065, False)
            now = time.monotonic()
            dt, last = min(.15, now-last), now
            if len(stamps) < 2 or any(now-s > .55 for s in stamps.values()):
                if now-start > 1.6:
                    yield {'error': 'no-data'}
                    return
                continue
            a, w = latest['accel'], latest['gyro']
            gravity = list(a) if gravity is None else [x+.30*(y-x) for x,y in zip(gravity,a)]
            if math.hypot(*w) < .9 and abs(math.hypot(*a)-1) < .08:
                gain = .25 if now-start < .8 else .015
                bias = [x+gain*(y-x) for x,y in zip(bias,w)]
            angles = view_angles(gravity, [x-b for x,b in zip(w,bias)], dt)
            if angles is None:
                continue
            dy, pitch, roll = angles
            yaw = (yaw+dy+180) % 360-180
            # One degree is more than sufficient for aiming a sky window.
            yield {'yaw': round(yaw), 'pitch': round(pitch), 'roll': round(roll)}


def orientation_stream(stop_after=None):
    if not _active.acquire(blocking=False):
        yield {'error': 'busy'}
        return
    try:
        yield from _poses(stop_after)
    except (OSError, AttributeError, ValueError):
        yield {'error': 'unavailable'}
    finally:
        _active.release()
