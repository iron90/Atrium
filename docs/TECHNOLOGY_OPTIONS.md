# Atrium Technology Options Comparison

Status: locked in as Tauri 2 + React/TypeScript + Rust. This file keeps the candidates, performance judgments, and trade-off rationale as a technology decision record; it no longer indicates that the current choice is still open.

## Decision

Atrium v1 uses `Tauri 2 + React + TypeScript + Rust`: React handles the high-density board, themes, and layouts; Rust handles local file/Git/process capabilities; Tauri provides the cross-platform desktop shell and the narrow IPC boundary. This combination keeps the desktop application form on macOS, Windows, and Linux while avoiding duplicating the projects' own build responsibilities inside Atrium.

## 1. Look at the Real Performance Requirements First

Atrium is not a game, a video editor, or a real-time collaborative whiteboard. Its main load is:

- enumerating tens to hundreds of project directories;
- reading a small number of manifests and configuration files;
- calling Git to read status and recent commits;
- starting the projects' own Run / Check / Build processes;
- displaying tables, cards, matrices, and command output.

What usually determines the experience is therefore not the UI framework's drawing speed, but:

1. whether the scan is asynchronous, cancellable, and incremental;
2. whether Git has caching and a concurrency limit;
3. whether command processes are independent of the UI, observable, and stoppable;
4. whether IPC transfers oversized output;
5. whether themes, layouts, and lists avoid meaningless re-renders.

All the mainstream options listed below can meet the v1 performance requirements. The differences lie mainly in runtime size, system integration, visual consistency, development cost, and long-term maintenance.

## 2. Candidate Overview

| Option                | UI technology               | Local capability | Resource footprint | macOS / Windows / Linux | Main strengths                                                                                     | Main costs                                                                                                  | Atrium fit  |
| --------------------- | --------------------------- | ---------------- | ------------------ | ----------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| Tauri 2               | React / Vue / Svelte + Rust | Very strong      | Low                | Supported               | Small runtime, Rust fits Git/process/file system work, existing experience carries over            | System WebView differences; Rust learning and cross-platform testing costs                                  | Very high   |
| Electron              | React / Vue + Node.js       | Very strong      | Fairly high        | Mature support          | Most complete web ecosystem, consistent Chromium rendering, Node makes local capability calls easy | Larger installer and memory; the main-process/renderer security boundary needs strict design                | Very high   |
| Flutter Desktop       | Dart + Flutter Widgets      | Strong           | Medium             | Stable support          | Own rendering, consistent themes and layouts, strong visual control                                | Requires giving up React/CSS; system integration depends on plugins or hand-written platform code           | High        |
| Wails 2               | React / Vue + Go            | Very strong      | Low                | Supported               | Strong Go local capabilities, uses the system WebView, frontend can still use web technologies     | WebView differences; ecosystem and team experience behind Tauri/Electron; Wails 3 is still in beta          | High        |
| Avalonia              | C# + XAML / Fluent          | Strong           | Medium             | Supported               | Draws its own controls, consistent cross-platform visuals, mature desktop capabilities             | Requires C#/.NET; complex visuals require learning the Avalonia system                                      | Medium-high |
| Qt 6                  | C++/QML or PySide           | Very strong      | Medium             | Mature support          | Most complete traditional desktop capabilities, mature system integration and complex controls     | C++/QML learning cost, complex packaging; licensing needs careful evaluation for commercial closed source   | Medium-high |
| Compose Multiplatform | Kotlin + Compose            | Strong           | Medium-high        | Supported               | Declarative UI, hardware acceleration, JetBrains ecosystem                                         | JVM/Gradle distribution is heavier; the local development toolchain is more complex                         | Medium      |
| .NET MAUI             | C# + XAML / Blazor          | Strong           | Medium             | Windows + Mac Catalyst  | Microsoft ecosystem, efficient business application development                                    | The macOS target is Mac Catalyst, not full AppKit; desktop details need extra handling                      | Medium      |
| Native dual-platform  | AppKit/SwiftUI + WinUI/WPF  | Strongest        | Low to medium      | macOS/Windows           | Most native experience on both platforms, most direct system capabilities                          | Two UI codebases to maintain, highest cost for individual development                                       | Medium-low  |
| Web + local daemon    | Browser + Rust/Go service   | Strong           | Low (frontend)     | Depends on the browser  | Most flexible UI development and updates, can connect to a website in the future                   | Not a full desktop application; process permissions, installation, and communication experience are complex | Medium-low  |

## 3. Option Analysis

### 3.1 Tauri 2 + React/TypeScript + Rust

Tauri uses the system WebView and connects the web UI to Rust native capabilities through message passing; the main desktop targets listed in the official documentation include macOS, Windows, and Linux. Windows uses WebView2 and macOS uses the system WebKit.

What fits Atrium:

- Rust can put the file system, Git CLI, subprocess supervision, and SQLite into one explicit native core;
- React/TypeScript is well suited to implementing three themes, multiple layouts, and complex information density;
- existing Tauri, Rust, and React experience from desktop projects can be reused;
- the installer and idle resource usage are usually lighter than Electron's.

Costs to accept:

- CSS, fonts, drag and drop, terminal output, and window behavior must be acceptance-tested separately on macOS WebKit and Windows WebView2;
- Windows and macOS still need their own build toolchains and test machines;
- once the native core uses Rust, the team must continuously maintain Rust types, error handling, and cross-platform branches.

Performance assessment: sufficient for Atrium. Scanning and Git must run in asynchronous native tasks, and the UI thread only receives incremental events and summaries.

### 3.2 Electron + React/TypeScript + Node.js

Electron bundles Chromium and Node.js into the application and uses a multi-process model with a main process, renderer processes, and an optional utility process.

What fits Atrium:

- Node has a very rich ecosystem of `fs`, `child_process`, PTY, Git packages, and logging;
- the Chromium version ships with the application, so cross-platform visual differences across three themes and complex CSS are smaller;
- React/TypeScript and automated testing tool choices are the widest;
- long-running build processes, terminal output, and log streams have a direct implementation path.

Costs:

- Chromium + Node bring a larger installer and higher resident memory;
- renderer and Node permissions must be strictly isolated, using preload/context isolation/narrow IPC;
- for a future lightweight, resident, low-interference personal tool, the resource cost is worse than Tauri/Wails.

Performance assessment: not eliminated for insufficient performance, but startup, idle memory, list rendering, and process output need proactive optimization. Electron's official guidance also puts the performance focus on avoiding main-process/renderer blocking, controlling dependencies, and continuous profiling.

### 3.3 Flutter Desktop

Flutter uses its own rendering system and does not depend on an HTML/CSS WebView; it officially supports Windows, macOS, and Linux desktops, and provides platform integration and native binding paths.

What fits Atrium:

- three themes and multiple layouts can be controlled by one Widget/Theme system;
- there is no need to handle CSS differences between WebKit and WebView2;
- animations, lists, and responsive layouts behave fairly consistently;
- if mobile should share a same-source UI later, the extension path is natural.

Costs:

- the UI must be rewritten in Dart/Flutter; React/CSS cannot be reused directly;
- file picking, Git, process supervision, terminal output, system menus, and similar capabilities depend on plugins or platform code;
- if the visual designs rely heavily on desktop-native behaviors, keyboard, window, and accessibility details need to be filled in proactively.

Performance assessment: fully sufficient for v1, and rendering consistency beats the system WebView route; but its advantage is mainly UI consistency, not the compute performance Atrium actually needs.

### 3.4 Wails + React/TypeScript + Go

Wails uses Go for the local layer and web technologies for the UI, reusing the system WebView; the official documentation lists Windows, macOS, and Linux support, and provides React/TypeScript templates and Go/JavaScript binding generation.

What fits Atrium:

- Go's file, process, concurrency, and network libraries suit the scanner and the runner;
- the UI can still use React/CSS;
- it is usually lighter than Electron, and its architecture concepts are easier for web-only developers to accept than Tauri's.

Costs:

- system WebView differences still apply;
- existing Rust/Tauri experience cannot be reused directly;
- Wails v3 is still in beta; if stability is the goal, lock to a stable version and a compatibility matrix.

Performance assessment: in the same lightweight WebView route as Tauri, with sufficient performance; the real deciding factor is the long-term maintenance preference between Go and Rust.

### 3.5 Avalonia + C#

Avalonia uses its own rendering engine to keep controls and visuals consistent across platforms; the official documentation lists targets including Windows, macOS, and Linux.

What fits Atrium:

- the desktop application mental model is clear; keyboard, windows, menus, lists, and settings pages feel natural;
- there is no dependency on a browser WebView, and cross-platform visuals are controllable;
- C# suits organizing the scanner, the runner, and persistence services.

Costs:

- requires accepting the .NET/XAML or Avalonia UI system;
- existing React/CSS design mocks cannot migrate directly;
- reproducing the very free-form Editorial/Glass visuals takes substantial custom control and theming work.

Performance assessment: sufficient, and it suits desktop-first products; if you or the Agent are unfamiliar with .NET, development efficiency is noticeably lower than React/Tauri.

### 3.6 Qt 6 + QML/C++ or PySide

Qt 6 officially supports macOS, Windows, and Linux, and provides two UI routes: Qt Quick/QML and Qt Widgets.

What fits Atrium:

- the most complete long-term desktop software capabilities;
- mature abstractions for windows, menus, system notifications, files, processes, and complex controls;
- QML is well suited to theming, animation, and custom layouts.

Costs:

- C++/QML engineering complexity is high; PySide lowers the coding barrier, but packaging and runtime management remain;
- Qt version, deployment approach, and third-party library licensing need careful design;
- Qt's open source licenses include LGPL/GPL and other conditions, and some modules may carry additional restrictions; a compliance check is mandatory before a commercial closed-source release.

Performance assessment: very strong, but overkill for Atrium. Unless it later grows into a complex IDE, a device manager, or a dense native desktop suite, the return on investment is worse than Tauri/Electron/Flutter.

### 3.7 Compose Multiplatform Desktop

JetBrains' Compose Multiplatform supports Windows, macOS, and Linux desktops, and provides hardware-accelerated desktop UI with menu, shortcut, window, and notification extensions.

What fits Atrium:

- Kotlin declarative UI suits theme and layout switching;
- comfortable for teams that like the JetBrains toolchain;
- if Android/iOS share a same-source UI later, there is room to extend.

Costs:

- the JVM/Gradle runtime and packaging chain are relatively heavy;
- local Git/process capabilities must be organized through Kotlin/JVM APIs or platform bridges;
- for a one-person operation, the toolchain and build times can weigh more than the product itself.

Performance assessment: rendering capability is sufficient, but resident resources, startup, and distribution complexity need dedicated verification.

### 3.8 .NET MAUI

.NET MAUI's desktop targets include Windows and macOS, but the macOS target is Mac Catalyst and the Windows target uses WinUI 3.

What fits Atrium:

- if C#/.NET services, desktop tools, and a deployment system already exist, the reuse value is high;
- business forms, settings, and data-entry interfaces develop efficiently;
- some business-layer code can be shared.

Main problems:

- Mac Catalyst is not the same thing as native AppKit; desktop menus, windows, and system behavior need special acceptance testing;
- for a local development tool application, the Blazor/MAUI combination adds WebView or runtime layers;
- Linux is not a primary official desktop target of .NET MAUI.

Performance assessment: adequate for v1, but not a preferred option for this kind of tool unless you explicitly want to consolidate into the .NET ecosystem.

### 3.9 Native Dual-Platform: macOS AppKit/SwiftUI + Windows WinUI/WPF

This is the route with the most native experience: macOS and Windows each use their own UI and system APIs, and the underlying layer can share a Rust/Go core.

The advantage is that system menus, windows, file dialogs, notifications, accessibility, and platform conventions are the most natural. The disadvantage is that UI, interaction, testing, and release each mean maintaining at least two codebases, and the ongoing cost for individual development is the highest.

It is worth choosing only under these conditions:

- Atrium's core competitive strength is the ultimate native experience;
- you are willing to maintain two frontends;
- more developers share the maintenance in the future.

### 3.10 Web + Local Daemon

The browser is responsible for the UI, and a Rust/Go service is responsible for local scanning and command execution. It can communicate over localhost/WebSocket.

The advantage is that the UI is the easiest to update, and it is also the easiest from which to migrate part of the functionality to a personal website. The problem is that installation, permissions, service lifecycle, port security, browser compatibility, and the question of whether it is even a desktop application all require extra design.

It suits the protocol layer of a future Website Server and is not recommended as the v1 primary desktop form.

## 4. Selection Guidance

### First tier: worth a POC before this decision

1. Tauri 2 + React/TypeScript + Rust
2. Electron + React/TypeScript + Node.js
3. Flutter Desktop
4. Wails + React/TypeScript + Go

### Second tier: choose when there is a clear ecosystem preference

- Avalonia: for a C# preference, desktop-native, visually consistent;
- Qt: for mature desktop platform capabilities, accepting C++/license governance;
- Compose: for the Kotlin/JetBrains ecosystem;
- .NET MAUI: for an existing .NET business system, accepting Mac Catalyst.

### Special routes

- Native dual-platform: pursues the ultimate platform experience, but does not fit current individual development resources;
- Web + daemon: fits as a future protocol or auxiliary mode, not as the sole v1 form.

## 5. Recommended Technical Verification Matrix

Before the final choice, the four first-tier candidates each run only the same small POC, not a full product:

1. Scan the projects under a local development directory (such as `~/projects`);
2. Read each repository's branches, worktree status, and 20 commits;
3. Discover commands from `package.json`, `Cargo.toml`, `pubspec.yaml`, and Makefile;
4. Start one short command and one long command, and observe output, cancellation, and exit codes;
5. Switch among the three themes and two layouts;
6. Build the installer once on macOS and once on Windows;
7. Record cold start, first scan, rescan, idle memory, command output latency, and failure recovery.

The final decision is not made on "whose theoretical performance is highest" but follows this order:

1. whether local file/Git/process capabilities are reliable;
2. whether the macOS/Windows experience is consistent and testable;
3. whether one person and the Agent can maintain it long term;
4. whether themes, layouts, and the no-Stage information model feel natural;
5. whether installer, startup, and idle resources fall within the comfortable range for a personal tool.
