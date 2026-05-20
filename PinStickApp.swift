import SwiftUI
import AppKit
import AVKit

@main
struct PinStickApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentViewWrapper()
                .frame(minWidth: 300, minHeight: 200)
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow?
    var contentRef: ContentView?

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let mainWindow = NSApplication.shared.windows.first {
            mainWindow.delegate = self
            self.window = mainWindow
        }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if sender.isDocumentEdited {
            let alert = NSAlert()
            alert.messageText = "Do you want to quit the app?"
            alert.informativeText = "Your notes will be lost if you don't save them elsewhere."
            alert.alertStyle = .warning
            alert.addButton(withTitle: "Quit")
            alert.addButton(withTitle: "Cancel")

            let response = alert.runModal()
            if response == .alertFirstButtonReturn {
                NSApp.terminate(nil)
            }
            return false
        } else {
            NSApp.terminate(nil)
            return false
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}

struct ContentViewWrapper: NSViewControllerRepresentable {
    func makeNSViewController(context: Context) -> NSHostingController<ContentView> {
        let view = ContentView()
        let controller = NSHostingController(rootView: view)
        DispatchQueue.main.async {
            if let window = controller.view.window {
                window.isDocumentEdited = false
                window.level = .normal
            }
        }
        return controller
    }

    func updateNSViewController(_ nsViewController: NSHostingController<ContentView>, context: Context) {}
}

struct ContentView: View {
    @AppStorage(MediaNoteSupport.noteStorageKey) private var text: String = ""
    @AppStorage(OverlayWindowSupport.opacityStorageKey) private var overlayOpacity: Double = 0.7
    @State private var localMedia: LocalMediaItem?
    @State private var isPinned: Bool = false
    @State private var isOverlay = false
    @State private var savedPinBeforeOverlay = false
    @State private var overlayButtonScreenFrame: CGRect = .zero
    @State private var headerToolbarScreenFrame: CGRect = .zero
    @State private var overlayMouseMonitor: OverlayMouseMonitor?
    @State private var overlayNoticeMessage: String?

    private var remoteMedia: [RemoteMediaItem] {
        MediaNoteSupport.parseRemoteMedia(from: text)
    }

    private var hasMedia: Bool {
        localMedia != nil || !remoteMedia.isEmpty
    }

    private var isEdited: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || hasMedia
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                Button(action: togglePin) {
                    Image(systemName: isPinned ? "pin.slash" : "pin")
                        .help(isPinned ? "Unpin Window" : "Pin Window")
                        .font(.system(size: 12))
                }
                .buttonStyle(PlainButtonStyle())
                .disabled(isOverlay)

                OverlayToolbarButton(
                    isActive: isOverlay,
                    screenFrame: $overlayButtonScreenFrame,
                    action: toggleOverlay,
                    onRightClick: showOverlayMenu
                )

                Spacer()
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                HeaderToolbarFrameTracker(screenFrame: $headerToolbarScreenFrame)
            )
            .background(Color(NSColor.windowBackgroundColor).opacity(isOverlay ? 0.92 : 1))

            if let overlayNoticeMessage {
                Text(overlayNoticeMessage)
                    .font(.system(size: 12))
                    .foregroundStyle(Color(red: 0.35, green: 0.29, blue: 0.07))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(red: 1.0, green: 0.97, blue: 0.9))
            }

            Divider()

            if hasMedia {
                MediaStageView(
                    localMedia: localMedia,
                    remoteMedia: remoteMedia,
                    onRemoveLocal: removeLocalMedia,
                    onRemoveRemote: removeRemoteMedia
                )
                .allowsHitTesting(!isOverlay)
            } else {
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $text)
                        .padding(8)
                        .font(.system(size: 16, design: .monospaced))
                        .disabled(isOverlay)

                    if text.isEmpty {
                        Text("Type your notes here… or double-click to add media.")
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 16)
                            .allowsHitTesting(false)
                    }
                }
                .contentShape(Rectangle())
                .allowsHitTesting(!isOverlay)
                .onTapGesture(count: 2) {
                    if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        openMediaFilePicker()
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            reloadLocalMedia()
            updateDocumentEdited()
        }
        .onChange(of: text) { _, _ in
            updateDocumentEdited()
        }
        .onChange(of: localMedia) { _, _ in
            updateDocumentEdited()
        }
        .onChange(of: remoteMedia.count) { _, _ in
            updateDocumentEdited()
        }
        .onChange(of: overlayOpacity) { _, newValue in
            OverlayWindowSupport.saveOpacity(newValue)
            if isOverlay {
                applyOverlayToWindow()
            }
        }
    }

    private func reloadLocalMedia() {
        if let loaded = MediaNoteSupport.loadLocalMedia() {
            localMedia = loaded
        }
    }

    private func updateDocumentEdited() {
        if let window = NSApplication.shared.windows.first {
            window.isDocumentEdited = isEdited
        }
    }

    private func removeLocalMedia() {
        if let localMedia {
            localMedia.url.stopAccessingSecurityScopedResource()
        }
        MediaNoteSupport.clearLocalMedia()
        self.localMedia = nil
    }

    private func removeRemoteMedia(_ item: RemoteMediaItem) {
        text = MediaNoteSupport.removeRemoteMedia(url: item.url, from: text)
    }

    private func openMediaFilePicker() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = [.image, .movie, .video]

        guard panel.runModal() == .OK, let url = panel.url else { return }
        guard let kind = MediaNoteSupport.classifyLocalFile(url: url) else { return }

        if let existing = localMedia {
            existing.url.stopAccessingSecurityScopedResource()
        }

        MediaNoteSupport.saveLocalMediaBookmark(for: url)
        _ = url.startAccessingSecurityScopedResource()
        localMedia = LocalMediaItem(url: url, kind: kind)
    }

    private func togglePin() {
        guard !isOverlay, let window = NSApplication.shared.windows.first else { return }
        isPinned.toggle()
        window.level = isPinned ? .floating : .normal
    }

    private func applyOverlayToWindow() {
        guard let window = NSApplication.shared.windows.first else { return }
        OverlayWindowSupport.applyOverlay(on: window, opacity: overlayOpacity)
    }

    private func isCursorOverHeaderControls() -> Bool {
        if OverlayWindowSupport.isMouseOver(rect: headerToolbarScreenFrame) {
            return true
        }
        if OverlayWindowSupport.isMouseOver(rect: overlayButtonScreenFrame) {
            return true
        }
        return false
    }

    private func toggleOverlay() {
        guard let window = NSApplication.shared.windows.first else { return }

        if isOverlay {
            isOverlay = false
            overlayNoticeMessage = nil
            overlayMouseMonitor?.stop()
            overlayMouseMonitor = nil
            OverlayWindowSupport.restoreNormalWindow(window, isPinned: savedPinBeforeOverlay)
            isPinned = savedPinBeforeOverlay
        } else {
            savedPinBeforeOverlay = isPinned
            isOverlay = true
            overlayNoticeMessage = nil
            applyOverlayToWindow()
            window.ignoresMouseEvents = false
            overlayMouseMonitor = OverlayMouseMonitor(window: window) {
                isCursorOverHeaderControls()
            }
            overlayMouseMonitor?.start()
        }
    }

    private func showOverlayMenu() {
        let menu = NSMenu()
        let opacityMenu = NSMenu(title: "Opacity")
        for (label, value) in [("40%", 0.4), ("55%", 0.55), ("70%", 0.7), ("85%", 0.85), ("100%", 1.0)] {
            let item = NSMenuItem(title: label, action: #selector(OverlayMenuHandler.setOpacity(_:)), keyEquivalent: "")
            item.target = OverlayMenuHandler.shared
            item.representedObject = value
            item.state = abs(overlayOpacity - value) < 0.01 ? .on : .off
            opacityMenu.addItem(item)
        }
        let opacityItem = NSMenuItem(title: "Opacity", action: nil, keyEquivalent: "")
        opacityItem.submenu = opacityMenu
        menu.addItem(opacityItem)
        menu.addItem(.separator())
        let exitItem = NSMenuItem(title: "Exit overlay", action: #selector(OverlayMenuHandler.exitOverlay(_:)), keyEquivalent: "")
        exitItem.target = OverlayMenuHandler.shared
        menu.addItem(exitItem)

        OverlayMenuHandler.shared.onSetOpacity = { value in
            overlayOpacity = value
        }
        OverlayMenuHandler.shared.onExitOverlay = {
            if isOverlay {
                toggleOverlay()
            }
        }

        if let event = NSApp.currentEvent {
            NSMenu.popUpContextMenu(menu, with: event, for: event.window?.contentView ?? NSView())
        }
    }
}

private struct HeaderToolbarFrameTracker: NSViewRepresentable {
    @Binding var screenFrame: CGRect

    func makeNSView(context: Context) -> HeaderToolbarFrameTrackerView {
        HeaderToolbarFrameTrackerView()
    }

    func updateNSView(_ nsView: HeaderToolbarFrameTrackerView, context: Context) {
        nsView.onFrameChange = { screenFrame = $0 }
        DispatchQueue.main.async {
            screenFrame = OverlayWindowSupport.frameInScreenCoordinates(for: nsView)
        }
    }
}

private final class HeaderToolbarFrameTrackerView: NSView {
    var onFrameChange: ((CGRect) -> Void)?

    override func layout() {
        super.layout()
        onFrameChange?(OverlayWindowSupport.frameInScreenCoordinates(for: self))
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        onFrameChange?(OverlayWindowSupport.frameInScreenCoordinates(for: self))
    }
}

private final class OverlayMenuHandler: NSObject {
    static let shared = OverlayMenuHandler()
    var onSetOpacity: ((Double) -> Void)?
    var onExitOverlay: (() -> Void)?

    @objc func setOpacity(_ sender: NSMenuItem) {
        if let value = sender.representedObject as? Double {
            onSetOpacity?(value)
        }
    }

    @objc func exitOverlay(_ sender: NSMenuItem) {
        onExitOverlay?()
    }
}

struct OverlayToolbarButton: NSViewRepresentable {
    let isActive: Bool
    @Binding var screenFrame: CGRect
    let action: () -> Void
    let onRightClick: () -> Void

    func makeNSView(context: Context) -> OverlayToolbarButtonView {
        let view = OverlayToolbarButtonView()
        view.onClick = action
        view.onRightClick = onRightClick
        return view
    }

    func updateNSView(_ nsView: OverlayToolbarButtonView, context: Context) {
        nsView.onClick = action
        nsView.onRightClick = onRightClick
        nsView.isActive = isActive
        nsView.updateScreenFrame = { screenFrame = $0 }
        nsView.refreshAppearance()
        DispatchQueue.main.async {
            screenFrame = OverlayWindowSupport.frameInScreenCoordinates(for: nsView)
        }
    }
}

final class OverlayToolbarButtonView: NSView {
    var onClick: (() -> Void)?
    var onRightClick: (() -> Void)?
    var updateScreenFrame: ((CGRect) -> Void)?
    var isActive = false

    private let button = NSButton(title: "🪟", target: nil, action: nil)

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        button.bezelStyle = .inline
        button.isBordered = false
        button.font = NSFont.systemFont(ofSize: 14)
        button.target = self
        button.action = #selector(handleClick)
        addSubview(button)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layout() {
        super.layout()
        button.frame = bounds
    }

    override func rightMouseDown(with event: NSEvent) {
        onRightClick?()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        updateScreenFrame?(OverlayWindowSupport.frameInScreenCoordinates(for: self))
    }

    func refreshAppearance() {
        button.contentTintColor = isActive ? NSColor.systemBlue : NSColor.labelColor
        toolTip = isActive ? "Exit overlay mode" : "Overlay mode"
    }

    @objc private func handleClick() {
        onClick?()
    }
}

struct MediaStageView: View {
    let localMedia: LocalMediaItem?
    let remoteMedia: [RemoteMediaItem]
    let onRemoveLocal: () -> Void
    let onRemoveRemote: (RemoteMediaItem) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                if let localMedia {
                    MediaEmbedView(kind: localMedia.kind, url: localMedia.url)
                        .onTapGesture(count: 2) {
                            onRemoveLocal()
                        }
                }

                ForEach(remoteMedia) { item in
                    MediaEmbedView(kind: item.kind, url: item.url)
                        .onTapGesture(count: 2) {
                            onRemoveRemote(item)
                        }
                }
            }
            .padding(8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black)
    }
}

struct MediaEmbedView: View {
    let kind: MediaKind
    let url: URL

    @State private var player: AVPlayer?

    var body: some View {
        Group {
            switch kind {
            case .image:
                if url.isFileURL {
                    if let image = NSImage(contentsOf: url) {
                        Image(nsImage: image)
                            .resizable()
                            .scaledToFit()
                    } else {
                        mediaError("Unable to load this image.")
                    }
                } else {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFit()
                        case .failure:
                            mediaError("Unable to load this image.")
                        default:
                            ProgressView()
                        }
                    }
                }
            case .video:
                if let player {
                    VideoPlayer(player: player)
                        .aspectRatio(16 / 9, contentMode: .fit)
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 120, maxHeight: .infinity)
        .help("Double-click to remove")
        .onAppear {
            if case .video = kind, player == nil {
                player = AVPlayer(url: url)
            }
        }
        .onDisappear {
            player?.pause()
            player = nil
        }
    }

    @ViewBuilder
    private func mediaError(_ message: String) -> some View {
        Text(message)
            .foregroundStyle(.red)
            .padding(8)
    }
}
