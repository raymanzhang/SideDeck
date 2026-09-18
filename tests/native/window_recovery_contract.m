// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

// Runs the production AppKit bridge with local presentation changes and
// synthetic workspace notifications. Does not sleep hardware or change persistent/global defaults.
#import <Cocoa/Cocoa.h>
#include <stdio.h>
extern void *hud_observe_window(void *, void (*)(void *, int), void *);
extern void hud_stop_observing(void *);
extern int hud_refresh_menu_bar(void *, int);
extern void hud_place_outer_frame(void *, double, double, double, double);
extern char *hud_window_snapshot(void *, void *);
extern void hud_free_string(char *);
static NSWindow *window;
static void *observer;
static int sleeps, wakes;
static void require(BOOL passed, const char *message) {
    if (!passed) { fprintf(stderr,"FAIL %s\n",message); exit(1); }
    printf("PASS %s\n",message); fflush(stdout);
}
static void received(void *context, int kind) {
    (void)context;
    if (kind == 6) sleeps++;
    if (kind == 7 || kind == 8) wakes++;
    if (kind == 2) dispatch_async(dispatch_get_main_queue(), ^{
        for (int iteration=0;iteration<2;iteration++) {
            int visiblePolicy = iteration == 0 ? 2 : 3;
            [NSUserDefaults.standardUserDefaults setVolatileDomain:@{@"AppleMenuBarVisibleInFullscreen":@YES, @"_HIHideMenuBar":@(iteration == 1)} forName:NSArgumentDomain];
            NSApplicationPresentationOptions original = NSApp.presentationOptions;
            require(hud_refresh_menu_bar((__bridge void *)window,visiblePolicy)==1,"visible policy accepted");
            require(NSApp.presentationOptions == original,"system-visible policy does not override AppKit");
            [NSUserDefaults.standardUserDefaults setVolatileDomain:@{@"AppleMenuBarVisibleInFullscreen":@NO, @"_HIHideMenuBar":@YES} forName:NSArgumentDomain];
            require(hud_refresh_menu_bar((__bridge void *)window,1)==1,"always-hide policy accepted");
            require((NSApp.presentationOptions & NSApplicationPresentationAutoHideMenuBar)!=0,iteration == 0 ? "Never to Always re-arms auto-hide" : "Desktop-only to Always re-arms auto-hide");
        }
        [window toggleFullScreen:nil];
    });
    if (kind == 4) dispatch_async(dispatch_get_main_queue(), ^{
        window.styleMask = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable;
        hud_place_outer_frame((__bridge void *)window,100,100,800,400);
        require((window.styleMask & NSWindowStyleMaskTitled)!=0,"fallback has native title bar");
        require(fabs(window.frame.size.width-800)<1 && fabs(window.frame.size.height-400)<1,"fallback outer frame includes title bar within 800x400");
        NSNotificationCenter *center=NSWorkspace.sharedWorkspace.notificationCenter;
        [center postNotificationName:NSWorkspaceWillSleepNotification object:nil];
        [center postNotificationName:NSWorkspaceDidWakeNotification object:nil];
        [center postNotificationName:NSWorkspaceScreensDidWakeNotification object:nil];
        require(sleeps==1 && wakes==2,"workspace sleep/system-wake/display-wake callbacks delivered");
        char *raw=hud_window_snapshot((__bridge void *)window,observer);
        require(raw!=NULL,"native snapshot available");
        NSDictionary *snapshot=[NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:raw length:strlen(raw)] options:0 error:nil];
        hud_free_string(raw);
        require([snapshot[@"menuBarPolicy"] isKindOfClass:NSNumber.class],"snapshot exposes current menu policy");
        hud_stop_observing(observer);
        [center postNotificationName:NSWorkspaceDidWakeNotification object:nil];
        require(wakes==2,"workspace observer cleanup stops callbacks");
        [window close]; exit(0);
    });
}
int main(void) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        window=[[NSWindow alloc] initWithContentRect:NSMakeRect(100,100,800,400)
            styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable
            backing:NSBackingStoreBuffered defer:NO];
        window.title=@"SideDeck native recovery checks";
        observer=hud_observe_window((__bridge void *)window,received,NULL);
        [window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        dispatch_async(dispatch_get_main_queue(), ^{ [window toggleFullScreen:nil]; });
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW,20*NSEC_PER_SEC),dispatch_get_main_queue(), ^{
            fprintf(stderr,"FAIL native notification timeout\n");exit(1);
        });
        [NSApp run];
    }
    return 1;
}
