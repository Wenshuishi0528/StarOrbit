import AppKit
import Foundation

struct LauncherConfig: Decodable { let root: String }
let checkOnly = CommandLine.arguments.contains("--check")
func fail(_ message: String) -> Never {
    if checkOnly { fputs(message + "\n", stderr) }
    else {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        app.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "星轨暂时无法启动"
        alert.informativeText = message
        alert.addButton(withTitle: "好")
        alert.runModal()
    }
    exit(1)
}
let bundle = Bundle.main
let manager = FileManager.default
let configURL = bundle.resourceURL!.appendingPathComponent("launcher-config.json")
guard let data = try? Data(contentsOf: configURL),
      let config = try? JSONDecoder().decode(LauncherConfig.self, from: data) else {
    fail("启动配置缺失，请重新创建桌面启动器。")
}
let root = URL(fileURLWithPath: config.root, isDirectory: true, relativeTo: bundle.bundleURL.deletingLastPathComponent()).standardizedFileURL
let html = root.appendingPathComponent("StarOrbit.html")
let server = root.appendingPathComponent("scripts/serve.py")
guard manager.fileExists(atPath: html.path), manager.fileExists(atPath: server.path) else {
    fail("找不到软件文件。请保留原来的软件目录：\n" + root.path)
}
guard let python = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"].first(where: { manager.isExecutableFile(atPath: $0) }) else {
    fail("未找到 Python 3。请安装 Python 3 后重新打开。")
}
let process = Process()
process.executableURL = URL(fileURLWithPath: python)
process.arguments = [server.path, "--background"]
process.currentDirectoryURL = root
let output = Pipe()
process.standardOutput = output
process.standardError = output
// The server's TLS fallback uses curl. Supply a predictable path when launched by Finder.
var environment = ProcessInfo.processInfo.environment
environment["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
process.environment = environment

do { try process.run() }
catch { fail("本地服务未能启动：" + error.localizedDescription) }
let result = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
process.waitUntilExit()
guard process.terminationStatus == 0 else { fail(result) }
if checkOnly {
    print("READY http://127.0.0.1:8771/ — " + html.path)
    exit(0)
}
let page = URL(string: "http://127.0.0.1:8771/" + "StarOrbit.html".addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!)!
guard NSWorkspace.shared.open(page) else { fail("浏览器未能打开。请访问：\n" + page.absoluteString) }
