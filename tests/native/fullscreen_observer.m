// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

// Test-only AppKit observations. Not linked into the production application.
#import <Cocoa/Cocoa.h>
#import <stdio.h>
static void report(NSString *event, NSWindow *window) {
    NSRect frame = window.frame;
    fprintf(stdout, "NATIVE {\"event\":\"%s\",\"uptime\":%.6f,\"fullscreenStyle\":%s,\"key\":%s,\"frame\":[%.1f,%.1f,%.1f,%.1f],\"presentationOptions\":%lu}\n",
        event.UTF8String, NSProcessInfo.processInfo.systemUptime,
        (window.styleMask & NSWindowStyleMaskFullScreen) ? "true" : "false",
        window.isKeyWindow ? "true" : "false", frame.origin.x, frame.origin.y,
        frame.size.width, frame.size.height, (unsigned long)NSApp.presentationOptions);
    fflush(stdout);
}
void *probe_observe(void *rawWindow) {
    NSWindow *window = (__bridge NSWindow *)rawWindow;
    NSMutableArray *tokens = [NSMutableArray array];
    __weak NSWindow *weakWindow = window;
    NSArray *names = @[NSWindowWillEnterFullScreenNotification, NSWindowDidEnterFullScreenNotification,
        NSWindowWillExitFullScreenNotification, NSWindowDidExitFullScreenNotification,
        NSWindowDidBecomeKeyNotification, NSWindowDidResignKeyNotification];
    for (NSString *name in names) {
        [tokens addObject:[NSNotificationCenter.defaultCenter addObserverForName:name object:window queue:nil usingBlock:^(NSNotification *note) {
            report(note.name, weakWindow);
        }]];
    }
    [tokens addObject:[NSWorkspace.sharedWorkspace.notificationCenter addObserverForName:NSWorkspaceActiveSpaceDidChangeNotification object:nil queue:nil usingBlock:^(NSNotification *note) {
        report(note.name, weakWindow);
    }]];
    report(@"ObserverReady", window);
    return (__bridge_retained void *)tokens;
}
void probe_stop(void *rawTokens) {
    NSArray *tokens = (__bridge_transfer NSArray *)rawTokens;
    for (id token in tokens) {
        [NSNotificationCenter.defaultCenter removeObserver:token];
        [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:token];
    }
}
