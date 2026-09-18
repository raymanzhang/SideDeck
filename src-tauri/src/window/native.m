// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

typedef void (*HudCallback)(void *, int);
@interface HudWindowObserver : NSObject
@property(nonatomic, strong) NSMutableArray *tokens;
@property(nonatomic, strong) NSMutableArray *workspaceTokens;
@property(nonatomic) BOOL transitioning;
@property(nonatomic, strong) id escapeMonitor;
@property(nonatomic, copy) NSString *menuDiagnosticSignature;
@end
@implementation HudWindowObserver
@end

// All bridge entry points and AppKit callbacks run on the main thread.
void *hud_observe_window(void *rawWindow, HudCallback callback, void *context) {
    NSWindow *window = (__bridge NSWindow *)rawWindow;
    HudWindowObserver *observer = [HudWindowObserver new];
    observer.tokens = [NSMutableArray array];
    observer.workspaceTokens = [NSMutableArray array];
    __weak HudWindowObserver *weakObserver = observer;
    NSArray *names = @[NSWindowWillEnterFullScreenNotification, NSWindowDidEnterFullScreenNotification,
        NSWindowWillExitFullScreenNotification, NSWindowDidExitFullScreenNotification];
    for (NSUInteger i = 0; i < names.count; i++) {
        [observer.tokens addObject:[NSNotificationCenter.defaultCenter addObserverForName:names[i] object:window queue:nil usingBlock:^(NSNotification *note) {
            (void)note;
            HudWindowObserver *current = weakObserver;
            if (!current) return;
            current.transitioning = (i == 0 || i == 2);
            callback(context, (int)i + 1);
        }]];
    }
    // NSWorkspace uses a separate notification center. Keep both sleep and
    // display wake events: external displays can become ready after system wake.
    NSArray *workspaceNames = @[NSWorkspaceWillSleepNotification, NSWorkspaceDidWakeNotification,
        NSWorkspaceScreensDidWakeNotification, NSWorkspaceScreensDidSleepNotification];
    for (NSUInteger i = 0; i < workspaceNames.count; i++) {
        [observer.workspaceTokens addObject:[NSWorkspace.sharedWorkspace.notificationCenter
            addObserverForName:workspaceNames[i] object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
                (void)note;
                if (!weakObserver) return;
                callback(context, i == 3 ? 6 : (int)i + 6);
            }]];
    }
    [observer.tokens addObject:[NSNotificationCenter.defaultCenter
        addObserverForName:NSApplicationDidChangeScreenParametersNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
            (void)note; if (weakObserver) callback(context, 9);
        }]];
    [observer.tokens addObject:[NSNotificationCenter.defaultCenter
        addObserverForName:NSUserDefaultsDidChangeNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
            (void)note; if (weakObserver) callback(context, 9);
        }]];
    // AppKit otherwise also exits native fullscreen when a WebView dialog handles
    // Escape. Route this key through the frontend's detail/settings hierarchy.
    __weak NSWindow *weakWindow = window;
    observer.escapeMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^NSEvent *(NSEvent *event) {
        if (event.window == weakWindow && event.keyCode == 53 && !(event.modifierFlags & (NSEventModifierFlagCommand | NSEventModifierFlagControl | NSEventModifierFlagOption))) {
            if (!event.isARepeat) callback(context, 5);
            return nil;
        }
        return event;
    }];
    return (__bridge_retained void *)observer;
}
void hud_stop_observing(void *rawObserver) {
    HudWindowObserver *observer = (__bridge_transfer HudWindowObserver *)rawObserver;
    for (id token in observer.tokens) [NSNotificationCenter.defaultCenter removeObserver:token];
    for (id token in observer.workspaceTokens) [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:token];
    if (observer.escapeMonitor) [NSEvent removeMonitor:observer.escapeMonitor];
}
static NSString *display_uuid(CGDirectDisplayID display) {
    CFUUIDRef uuid = CGDisplayCreateUUIDFromDisplayID(display);
    if (!uuid) return @"";
    NSString *result = CFBridgingRelease(CFUUIDCreateString(kCFAllocatorDefault, uuid));
    CFRelease(uuid);
    return result;
}
// Read fresh global values only. Do not write either preference or cache a
// per-application override, which would prevent later System Settings changes.
static BOOL global_bool(CFStringRef key, BOOL fallback) {
    CFPropertyListRef value = CFPreferencesCopyValue(key, kCFPreferencesAnyApplication,
        kCFPreferencesCurrentUser, kCFPreferencesAnyHost);
    BOOL result = fallback;
    if (value && CFGetTypeID(value) == CFBooleanGetTypeID()) result = CFBooleanGetValue(value);
    else if (value && CFGetTypeID(value) == CFNumberGetTypeID()) {
        int number = 0; CFNumberGetValue(value, kCFNumberIntType, &number); result = number != 0;
    }
    if (value) CFRelease(value);
    return result;
}
static int menu_bar_policy(void) {
    CFPreferencesSynchronize(kCFPreferencesAnyApplication, kCFPreferencesCurrentUser, kCFPreferencesAnyHost);
    return (global_bool(CFSTR("_HIHideMenuBar"), NO) ? 1 : 0)
        | (global_bool(CFSTR("AppleMenuBarVisibleInFullscreen"), NO) ? 2 : 0);
}
// Opt-in diagnostics contain state/flags only, never screen contents or app names.
static void trace_menu(NSWindow *window, int policy, const char *stage) {
    if (!getenv("SYSHUD_WINDOW_TRACE")) return;
    NSRect screen = window.screen.frame;
    NSPoint pointer = NSEvent.mouseLocation;
    BOOL onDisplay = window.screen && NSPointInRect(pointer, screen);
    fprintf(stderr, "WINDOW_MENU {\"stage\":\"%s\",\"timeMs\":%.0f,\"uptime\":%.3f,\"policy\":%d,\"desktopAutoHide\":%s,\"fullscreenMenuVisible\":%s,\"active\":%s,\"key\":%s,\"fullscreen\":%s,\"appOptions\":%lu,\"systemOptions\":%lu,\"pointerOnDisplay\":%s,\"pointerFromTop\":%.1f}\n",
        stage, NSDate.date.timeIntervalSince1970 * 1000, NSProcessInfo.processInfo.systemUptime, policy,
        (policy & 1) ? "true" : "false", (policy & 2) ? "true" : "false",
        NSApp.isActive ? "true" : "false", window.isKeyWindow ? "true" : "false",
        (window.styleMask & NSWindowStyleMaskFullScreen) ? "true" : "false",
        (unsigned long)NSApp.presentationOptions, (unsigned long)NSApp.currentSystemPresentationOptions,
        onDisplay ? "true" : "false", onDisplay ? NSMaxY(screen) - pointer.y : -1.0);
    fflush(stderr);
}
// Apply an app-local refresh, preserving unrelated AppKit presentation flags.
// In particular, clear auto-hide toolbar before clearing auto-hide menu bar:
// AppKit rejects that otherwise-invalid combination.
int hud_refresh_menu_bar(void *rawWindow, int policy) {
    NSWindow *window = (__bridge NSWindow *)rawWindow;
    trace_menu(window, policy, "requested");
    if (!(window.styleMask & NSWindowStyleMaskFullScreen)) { trace_menu(window, policy, "skipped-windowed"); return 0; }
    // Never/desktop-only is already handled by macOS. Clearing menu flags in a
    // native fullscreen window can make AppKit substitute HideMenuBar instead,
    // so do not override the system's visible policy.
    if (policy & 2) { trace_menu(window, policy, "system-visible-policy"); return 1; }
    @try {
        NSApplicationPresentationOptions base = NSApp.presentationOptions;
        NSApplicationPresentationOptions visible = base & ~(NSApplicationPresentationAutoHideMenuBar
            | NSApplicationPresentationHideMenuBar | NSApplicationPresentationAutoHideToolbar);
        if (!(policy & 2)) {
            NSApplicationPresentationOptions hidden = (base & ~NSApplicationPresentationHideMenuBar)
                | NSApplicationPresentationAutoHideMenuBar;
            if (!(hidden & (NSApplicationPresentationHideDock | NSApplicationPresentationAutoHideDock)))
                hidden |= NSApplicationPresentationAutoHideDock;
            // Re-arm even if AppKit retained the same flags through a visible→hidden policy change.
            NSApp.presentationOptions = visible;
            NSApp.presentationOptions = hidden;
        }
        trace_menu(window, policy, "applied");
        return 1;
    } @catch (NSException *exception) {
        (void)exception; trace_menu(window, policy, "failed"); return -1;
    }
}
// Place the complete outer frame (including the fallback title bar) inside
// the selected screen's work area. Input is Quartz global logical coordinates.
void hud_place_outer_frame(void *rawWindow, double x, double y, double width, double height) {
    NSWindow *window = (__bridge NSWindow *)rawWindow;
    CGFloat top = NSMaxY(NSScreen.screens.firstObject.frame);
    [window setFrame:NSMakeRect(x, top - y - height, width, height) display:YES];
}
// Geometry uses the same physical-coordinate conversion as Tao's macOS monitor API.
char *hud_window_snapshot(void *rawWindow, void *rawObserver) {
    NSWindow *window = (__bridge NSWindow *)rawWindow;
    HudWindowObserver *observer = (__bridge HudWindowObserver *)rawObserver;
    NSMutableArray *displays = [NSMutableArray array];
    for (NSScreen *screen in NSScreen.screens) {
        CGDirectDisplayID display = [screen.deviceDescription[@"NSScreenNumber"] unsignedIntValue];
        CGRect bounds = CGDisplayBounds(display);
        NSRect frame = screen.frame, visible = screen.visibleFrame;
        double scale = screen.backingScaleFactor;
        if (!CGDisplayIsOnline(display) || scale <= 0 || visible.size.width <= 0 || visible.size.height <= 0) continue;
        NSString *uuid = display_uuid(display);
        [displays addObject:@{
            @"id": uuid, @"name": (screen.localizedName.length ? screen.localizedName : @"Display"),
            @"legacyName": [NSString stringWithFormat:@"Monitor #%u", CGDisplayModelNumber(display)],
            @"primary": (display == CGMainDisplayID() ? @YES : @NO), @"scaleFactor": @(scale),
            @"x": @(lround(bounds.origin.x * scale)), @"y": @(lround(bounds.origin.y * scale)),
            @"width": @(lround(frame.size.width * scale)), @"height": @(lround(frame.size.height * scale)),
            @"work": @{
                @"x": @(lround((bounds.origin.x + visible.origin.x - frame.origin.x) * scale)),
                @"y": @(lround((bounds.origin.y + NSMaxY(frame) - NSMaxY(visible)) * scale)),
                @"width": @(lround(visible.size.width * scale)), @"height": @(lround(visible.size.height * scale))
            }
        }];
    }
    CGDirectDisplayID current = [window.screen.deviceDescription[@"NSScreenNumber"] unsignedIntValue];
    int policy = menu_bar_policy();
    if (getenv("SYSHUD_WINDOW_TRACE")) {
        NSString *signature = [NSString stringWithFormat:@"%d/%lu/%lu/%d/%d/%d/%d", policy,
            (unsigned long)NSApp.presentationOptions, (unsigned long)NSApp.currentSystemPresentationOptions,
            NSApp.isActive, window.isKeyWindow, (window.styleMask & NSWindowStyleMaskFullScreen) != 0, observer.transitioning];
        if (![signature isEqualToString:observer.menuDiagnosticSignature]) {
            observer.menuDiagnosticSignature = signature;
            trace_menu(window, policy, "observed");
        }
    }
    NSDictionary *state = @{
        @"displays": displays,
        @"menuBarPolicy": @(policy),
        @"actualDisplay": window.screen ? display_uuid(current) : (id)NSNull.null,
        @"fullscreen": ((window.styleMask & NSWindowStyleMaskFullScreen) != 0 ? @YES : @NO),
        @"transitioning": (observer.transitioning ? @YES : @NO)
    };
    NSData *data = [NSJSONSerialization dataWithJSONObject:state options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    return json ? strdup(json.UTF8String) : NULL;
}
void hud_free_string(char *value) { free(value); }
