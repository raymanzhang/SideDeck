// macOS test helper: interact with only SideDeck's accessible controls.
import Cocoa
import ApplicationServices
func fail(_ message: String) -> Never { fputs(message + "\n", stderr); exit(1) }
func get(_ e: AXUIElement, _ key: String) -> CFTypeRef? {
    var value: CFTypeRef?; AXUIElementCopyAttributeValue(e, key as CFString, &value); return value
}
func labels(_ e: AXUIElement) -> [String] {
    ["AXTitle", "AXDescription", "AXValue"].compactMap { get(e, $0) as? String }
}
func children(_ e: AXUIElement) -> [AXUIElement] { get(e, "AXChildren") as? [AXUIElement] ?? [] }
func find(_ e: AXUIElement, _ name: String) -> AXUIElement? {
    if labels(e).contains(name), ["AXButton", "AXPopUpButton", "AXMenuItem", "AXRadioButton", "AXCheckBox", "AXToggleButton"].contains(get(e,"AXRole") as? String ?? "") { return e }
    for child in children(e) { if let result = find(child, name) { return result } }
    return nil
}
func dump(_ e: AXUIElement) {
    let role = get(e, "AXRole") as? String ?? ""
    if ["AXButton", "AXPopUpButton", "AXMenuItem", "AXCheckBox", "AXToggleButton", "AXRadioButton"].contains(role) { print(role, labels(e).joined(separator:" | ")) }
    for child in children(e) { dump(child) }
}
guard let app = NSWorkspace.shared.runningApplications.first(where: {$0.executableURL?.lastPathComponent == "sidedeck"}) else { fail("SideDeck is not running") }
let args = CommandLine.arguments
if args.count > 1 && args[1] == "quit" { app.terminate(); exit(0) }
let applicationRoot = AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetAttributeValue(applicationRoot, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
if args.count < 2 || args[1] != "click-inactive" { app.activate() }
var readyWindow: AXUIElement?
for _ in 0..<30 {
    readyWindow = (get(applicationRoot,"AXWindows") as? [AXUIElement])?.first
    if readyWindow != nil { break }
    RunLoop.current.run(until:Date().addingTimeInterval(0.1))
}
guard let root = readyWindow else { fail("SideDeck window is not ready on this Space; activate it before retrying") }
if args.count > 1 && args[1] == "focused" {
    if let value=get(applicationRoot,"AXFocusedUIElement") { print("focused",labels(value as! AXUIElement).joined(separator:" | ")) }
    exit(0)
}
if args.count > 1 && args[1] == "resize" {
    var size = CGSize(width:800,height:400)
    let result = AXUIElementSetAttributeValue(root,"AXSize" as CFString,AXValueCreate(.cgSize,&size)!)
    print("resize",result.rawValue);exit(result == .success ? 0 : 1)
}
if args.count > 1 && args[1] == "scroll" {
    var position=CGPoint.zero,size=CGSize.zero
    guard let p=get(root,"AXPosition"),let s=get(root,"AXSize") else {fail("Missing window geometry")}
    AXValueGetValue(p as! AXValue,.cgPoint,&position);AXValueGetValue(s as! AXValue,.cgSize,&size)
    let point=CGPoint(x:position.x+size.width*0.4,y:position.y+size.height*0.6)
    CGWarpMouseCursorPosition(point)
    let event=CGEvent(scrollWheelEvent2Source:nil,units:.pixel,wheelCount:1,wheel1:-500,wheel2:0,wheel3:0)
    event?.location=point;event?.post(tap:.cghidEventTap)
    RunLoop.current.run(until:Date().addingTimeInterval(0.1));print("scrolled",point);exit(0)
}
if args.count < 2 || args[1] == "list" { dump(root); exit(0) }
if args.count < 2 || args[1] != "click-inactive" { app.activate() }
if args[1] == "escape" {
    CGEvent(keyboardEventSource:nil,virtualKey:53,keyDown:true)?.post(tap:.cghidEventTap)
    RunLoop.current.run(until:Date().addingTimeInterval(0.08))
    CGEvent(keyboardEventSource:nil,virtualKey:53,keyDown:false)?.post(tap:.cghidEventTap)
    exit(0)
}
let name = args.dropFirst(2).joined(separator:" ")
var found: AXUIElement?
for _ in 0..<30 {
    let currentRoot = (get(applicationRoot,"AXWindows") as? [AXUIElement])?.first ?? root
    found = find(currentRoot,name)
    if found != nil { break }
    RunLoop.current.run(until:Date().addingTimeInterval(0.1))
}
guard let control = found else { fail("Control not found: \(name)") }
if args[1] == "wait" { print("found",name); exit(0) }
if args[1] == "click" || args[1] == "click-inactive" {
    var position = CGPoint.zero, size = CGSize.zero
    guard let p=get(control,"AXPosition"),let s=get(control,"AXSize") else { fail("Missing control geometry") }
    AXValueGetValue(p as! AXValue,.cgPoint,&position);AXValueGetValue(s as! AXValue,.cgSize,&size)
    let point=CGPoint(x:position.x+size.width/2,y:position.y+size.height/2)
    print("click",name,point)
    CGWarpMouseCursorPosition(point)
    let down = CGEvent(mouseEventSource:nil,mouseType:.leftMouseDown,mouseCursorPosition:point,mouseButton:.left)
    let up = CGEvent(mouseEventSource:nil,mouseType:.leftMouseUp,mouseCursorPosition:point,mouseButton:.left)
    down?.setIntegerValueField(.mouseEventClickState,value:1)
    up?.setIntegerValueField(.mouseEventClickState,value:1)
    down?.post(tap:.cghidEventTap)
    RunLoop.current.run(until:Date().addingTimeInterval(0.08))
    up?.post(tap:.cghidEventTap)
    print("AX trusted",AXIsProcessTrusted())
} else {
    let result=AXUIElementPerformAction(control,"AXPress" as CFString)
    print("press",name,result.rawValue)
    if result != .success { exit(1) }
}
