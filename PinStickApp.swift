import SwiftUI
import AppKit

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
            alert.messageText = "Close PinStick"
            alert.informativeText = "What would you like to do with your saved notes?"
            alert.alertStyle = .warning
            alert.addButton(withTitle: "Keep Notes")
            alert.addButton(withTitle: "Delete Notes")
            alert.addButton(withTitle: "Cancel")

            let response = alert.runModal()
            switch response {
            case .alertFirstButtonReturn: // Keep Notes — data stays in UserDefaults
                NSApp.terminate(nil)
                return false
            case .alertSecondButtonReturn: // Delete Notes — shred saved data, then quit
                UserDefaults.standard.removeObject(forKey: "pinstick-note")
                NSApp.terminate(nil)
                return false
            default: // Cancel — abort the close
                return false
            }
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
                let savedNote = UserDefaults.standard.string(forKey: "pinstick-note") ?? ""
                window.isDocumentEdited = !savedNote.isEmpty
                window.level = .normal // default level
            }
        }
        return controller
    }

    func updateNSViewController(_ nsViewController: NSHostingController<ContentView>, context: Context) {}
}

struct ContentView: View {
    @AppStorage("pinstick-note") private var text: String = ""

    @State private var isPinned: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: togglePin) {
                    Image(systemName: isPinned ? "pin.slash" : "pin")
                        .help(isPinned ? "Unpin Window" : "Pin Window")
                        .font(.system(size: 12))
                }
                .buttonStyle(PlainButtonStyle())
                .padding(.horizontal, 8)
                .padding(.vertical, 4)

                Spacer()
            }
            .background(Color(NSColor.windowBackgroundColor))

            Divider()

            TextEditor(text: $text)
                .padding(8)
                .font(.system(size: 16, design: .monospaced))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onChange(of: text) { oldValue, newValue in
            if let window = NSApplication.shared.windows.first {
                window.isDocumentEdited = !newValue.isEmpty
            }
        }
    }

    private func togglePin() {
        guard let window = NSApplication.shared.windows.first else { return }
        isPinned.toggle()
        window.level = isPinned ? .floating : .normal
    }
}
