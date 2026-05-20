import AppKit
import SwiftUI

enum OverlayWindowSupport {
    static let opacityStorageKey = "pinstick-overlay-opacity"

    static func defaultOpacity() -> Double {
        let stored = UserDefaults.standard.double(forKey: opacityStorageKey)
        if stored > 0 {
            return min(1, max(0.4, stored))
        }
        return 0.7
    }

    static func saveOpacity(_ value: Double) {
        let clamped = min(1, max(0.4, value))
        UserDefaults.standard.set(clamped, forKey: opacityStorageKey)
    }

    static func applyOverlay(on window: NSWindow, opacity: Double) {
        window.level = .floating
        window.isOpaque = false
        window.backgroundColor = .clear
        window.alphaValue = opacity
        window.ignoresMouseEvents = true
    }

    static func restoreNormalWindow(_ window: NSWindow, isPinned: Bool) {
        window.ignoresMouseEvents = false
        window.isOpaque = true
        window.backgroundColor = nil
        window.alphaValue = 1
        window.level = isPinned ? .floating : .normal
    }

    static func frameInScreenCoordinates(for view: NSView) -> CGRect {
        let bounds = view.bounds
        let origin = view.convert(NSPoint(x: bounds.minX, y: bounds.minY), to: nil)
        let size = view.convert(NSPoint(x: bounds.maxX, y: bounds.maxY), to: nil)
        let windowRect = NSRect(
            x: min(origin.x, size.x),
            y: min(origin.y, size.y),
            width: abs(size.x - origin.x),
            height: abs(size.y - origin.y)
        )
        return view.window?.convertToScreen(windowRect) ?? .zero
    }

    static func isMouseOver(rect: CGRect) -> Bool {
        guard !rect.isEmpty else { return false }
        let mouse = NSEvent.mouseLocation
        return rect.contains(mouse)
    }
}

/// Polls mouse position without Accessibility permissions (unlike global event monitors).
final class OverlayMouseMonitor {
    private var timer: Timer?
    private weak var window: NSWindow?
    private let hitTest: () -> Bool

    init(window: NSWindow, hitTest: @escaping () -> Bool) {
        self.window = window
        self.hitTest = hitTest
    }

    func start() {
        stop()
        timer = Timer.scheduledTimer(withTimeInterval: 0.06, repeats: true) { [weak self] _ in
            guard let self, let window = self.window else { return }
            window.ignoresMouseEvents = !self.hitTest()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    deinit {
        stop()
    }
}
