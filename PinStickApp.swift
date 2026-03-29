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
                window.level = .normal // default level
            }
        }
        return controller
    }

    func updateNSViewController(_ nsViewController: NSHostingController<ContentView>, context: Context) {}
}

struct ContentView: View {
    @State private var text: String = "" {
        didSet {
            if let window = NSApplication.shared.windows.first {
                window.isDocumentEdited = !text.isEmpty
            }
        }
    }

    @State private var isPinned: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: togglePin) {
                    Image(systemName: isPinned ? "pin.slash" : "pin")
                        .help(isPinned ? "Unpin Window" : "Pin Window")
                }
                .buttonStyle(PlainButtonStyle())
                .padding(6)

                Spacer()
            }
            .background(Color(NSColor.windowBackgroundColor))

            Divider()

            TextEditor(text: $text)
                .padding(8)
                .font(.system(size: 16, design: .monospaced))
                .background(Color.white)
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
