"""Independent numerical fixtures for the daytime atlas production helpers.
Run with the data Python environment (numpy, Pillow, rasterio).
No network, global atlas generation or browser is needed.
"""
from pathlib import Path
import importlib.util
import math
import numpy as np
from PIL import Image
from rasterio.transform import from_origin
from rasterio.warp import transform as project_points

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('atlas',ROOT/'scripts/assemble-day-modis-2026.py')
atlas=importlib.util.module_from_spec(spec);spec.loader.exec_module(atlas)

# Published sRGB transfer values, including its linear toe and 18% grey. These
# are energy/encoding references, not visually selected colours.
rho=np.array([0,.0031308,.05,.18,.5,1],dtype='float32')
np.testing.assert_array_equal(atlas.encode(rho),[0,10,63,118,188,255])
np.testing.assert_allclose(atlas.decode(np.array([0,10,63,118,188,255])),
                           [0,.00303527,.04970657,.18116424,.50288646,1],atol=1e-7)
np.testing.assert_array_equal(atlas.encode(np.array([-.2,1.2])),[0,255])
grey=np.repeat(rho[:,None],3,axis=1)
assert np.all(atlas.encode(grey)==atlas.encode(grey)[:,0,None]),'neutral reflectance must stay neutral'
# An average of equal black/white areas is 50% reflectance, encoded as 188;
# averaging encoded 0 and 255 directly would incorrectly give ~128.
checker=np.repeat(np.array([[0,1],[1,0]],dtype='float32')[:,:,None],3,axis=2)
mean=atlas.resize_linear(checker,(1,1))
np.testing.assert_allclose(mean,.5,atol=1e-7)
np.testing.assert_array_equal(atlas.encode(mean),np.full((1,1,3),188))
np.testing.assert_allclose(atlas.resize_linear(np.full((30,40,3),.18,dtype='float32'),(7,5)),.18,atol=1e-7)

# A straight missing-data edge must meet the fallback at zero weight, reach full
# weight within three interior pixels, and never introduce data into the hole.
valid=np.zeros((15,20),dtype=bool);valid[:,8:]=True
weights=atlas.gap_weight(valid)
np.testing.assert_array_equal(weights[:,:9],0)
np.testing.assert_allclose(weights[:,9:12],np.tile([7/27,20/27,1],(15,1)),atol=1e-7)
np.testing.assert_array_equal(weights[:,12:],1)
np.testing.assert_array_equal(atlas.gap_weight(np.ones((15,20),dtype=bool)),1)
np.testing.assert_array_equal(atlas.gap_weight(np.zeros((15,20),dtype=bool)),0)
# Two neighbouring atlas tiles must calculate identical weights throughout their
# overlapping gutters, including a missing pixel near the shared boundary.
valid=np.ones((30,80),dtype=bool);valid[15,39]=False
left=atlas.gap_weight(valid[:,:48]);right=atlas.gap_weight(valid[:,32:])
np.testing.assert_allclose(left[4:-4,36:44],right[4:-4,4:12],atol=0)

# Bilinear RGB interpolation must conservatively carry lower-quality inputs.
# The expected mixtures are derived from equal distances to source centres.
src=np.repeat(np.tile([.05,.25,.75],(3,1))[None,:,:],3,axis=0).astype('float32')
quality=np.tile([2,2,1],(3,1)).astype('uint8')
source_transform=from_origin(0,3,1,1)
dest,dq=atlas.project_quality(src,quality,source_transform,'EPSG:4326',from_origin(.5,3,1,1),(3,2))
np.testing.assert_allclose(dest[:,:,0],.15,atol=1e-7)
np.testing.assert_allclose(dest[:,:,1],.5,atol=1e-7)
np.testing.assert_array_equal(dq[:,0],2)
np.testing.assert_array_equal(dq[:,1],1)
# Empty observations remain empty, including outside the source footprint.
src[:]=np.nan;quality[:]=0
dest,dq=atlas.project_quality(src,quality,source_transform,'EPSG:4326',from_origin(-1,4,1,1),(5,5))
assert np.isnan(dest).all();assert not dq.any()

# Pixel-centre registration of a half-parent 2004 fallback tile. A synthetic
# encoded ramp provides an independent analytic bilinear reference in linear
# space; ordinary detail boundaries must not shift by a source pixel.
column=np.arange(1816);row=np.arange(1816)
parent=np.empty((1816,1816,3),dtype='uint8')
parent[:,:,0]=(column//8)[None,:];parent[:,:,1]=(row//8)[:,None];parent[:,:,2]=118
image=Image.fromarray(parent)
for x,y in [(0,0),(1,0),(0,1),(1,1)]:
    result=atlas.sample_legacy_tile(image,x,y)
    assert result.shape==(1816,1816,3)
    for j,i in [(8,8),(907,909),(1807,1807)]:
        # Modern grid is twice the old resolution, with 8 new-pixel gutters.
        px=8+(x%2)*900+(i-8+.5)/2-.5
        py=8+(y%2)*900+(j-8+.5)/2-.5
        ix,iy=math.floor(px),math.floor(py);fx,fy=px-ix,py-iy
        patch=atlas.decode(parent[iy:iy+2,ix:ix+2])
        expected=patch[0,0]*(1-fx)*(1-fy)+patch[0,1]*fx*(1-fy)+patch[1,0]*(1-fx)*fy+patch[1,1]*fx*fy
        np.testing.assert_allclose(result[j,i],expected,atol=1e-7)
# Adjacent half-parent tiles share exactly the same 16 overlap pixels.
a=atlas.sample_legacy_tile(image,0,0);b=atlas.sample_legacy_tile(image,1,0)
np.testing.assert_allclose(a[8:-8,1800:1816],b[8:-8,:16],atol=1e-7)

# Actual MODIS sinusoidal geometry. Near-pole inverse bounds cross a singularity:
# 89N,179W is inside h17v00 even though ordinary edge densification may omit it.
R=6371007.181;tile_width=2*math.pi*R/36
crs=f'+proj=sinu +R={R} +nadgrids=@null +wktext'
def transform_for(h,v): return from_origin((h-18)*tile_width,(9-v)*tile_width,tile_width/1200,tile_width/1200)
polar=transform_for(17,0)
west,south,east,north=atlas.geographic_bounds('h17v00',(1200,1200),polar,crs)
assert west==-180 and east==180
np.testing.assert_allclose([south,north],[80,90],atol=1e-6)
xs,ys=project_points('EPSG:4326',crs,[-179],[89]);px,py=(~polar)*(xs[0],ys[0])
assert 0<px<1200 and 0<py<1200
south_bounds=atlas.geographic_bounds('h18v17',(1200,1200),transform_for(18,17),crs)
assert south_bounds[0]==-180 and south_bounds[2]==180
np.testing.assert_allclose([south_bounds[1],south_bounds[3]],[-90,-80],atol=1e-6)
# Non-polar coverage still retains the actual latitude band and date-line split.
ordinary=atlas.geographic_bounds('h27v06',(1200,1200),transform_for(27,6),crs)
np.testing.assert_allclose([ordinary[1],ordinary[3]],[20,30],atol=1e-6)
assert ordinary[0]<106.5<ordinary[2]
wrapped=atlas.geographic_bounds('h00v08',(1200,1200),transform_for(0,8),crs)
assert wrapped[0]>wrapped[2] and wrapped[2]>-179,'date-line bounds retain the west-side interval'

print('Day atlas: standard sRGB, linear averages, nodata feather, conservative QA, legacy registration, pole/date-line bounds passed')
