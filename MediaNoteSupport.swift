import Foundation
import UniformTypeIdentifiers

enum MediaKind: String, Codable {
    case image
    case video
}

struct RemoteMediaItem: Identifiable, Equatable {
    let id: String
    let url: URL
    let kind: MediaKind
}

struct LocalMediaItem: Equatable {
    let url: URL
    let kind: MediaKind
}

enum MediaNoteSupport {
    static let noteStorageKey = "pinstick-note"
    static let localMediaBookmarkKey = "pinstick-local-media-bookmark"

    private static let imageExtensions = ["avif", "bmp", "gif", "jpg", "jpeg", "png", "svg", "webp"]
    private static let videoExtensions = ["m4v", "mov", "mp4", "ogg", "ogv", "webm"]
    private static let trailingPunctuation = CharacterSet(charactersIn: "),.!?;:")

    static func classifyMediaURL(_ url: URL) -> MediaKind? {
        let path = url.path.lowercased()
        let ext = (path as NSString).pathExtension
        if imageExtensions.contains(ext) {
            return .image
        }
        if videoExtensions.contains(ext) {
            return .video
        }
        return nil
    }

    static func classifyLocalFile(url: URL) -> MediaKind? {
        if let type = try? url.resourceValues(forKeys: [.contentTypeKey]).contentType {
            if type.conforms(to: .image) {
                return .image
            }
            if type.conforms(to: .movie) || type.conforms(to: .video) {
                return .video
            }
        }
        return classifyMediaURL(url)
    }

    static func parseRemoteMedia(from noteText: String) -> [RemoteMediaItem] {
        var items: [RemoteMediaItem] = []
        var seen = Set<String>()

        let markdownPattern = #"!\[[^\]]*\]\((https?://[^)\s]+)\)"#
        if let regex = try? NSRegularExpression(pattern: markdownPattern) {
            let range = NSRange(noteText.startIndex..<noteText.endIndex, in: noteText)
            regex.enumerateMatches(in: noteText, range: range) { match, _, _ in
                guard let match,
                      match.numberOfRanges > 1,
                      let urlRange = Range(match.range(at: 1), in: noteText) else { return }
                appendRemoteURL(String(noteText[urlRange]), to: &items, seen: &seen)
            }
        }

        let urlPattern = #"https?://[^\s<>"')\]]+"#
        if let regex = try? NSRegularExpression(pattern: urlPattern) {
            let range = NSRange(noteText.startIndex..<noteText.endIndex, in: noteText)
            regex.enumerateMatches(in: noteText, range: range) { match, _, _ in
                guard let match, let urlRange = Range(match.range, in: noteText) else { return }
                appendRemoteURL(String(noteText[urlRange]), to: &items, seen: &seen)
            }
        }

        return items
    }

    static func removeRemoteMedia(url: URL, from noteText: String) -> String {
        let urlString = url.absoluteString
        var updated = noteText

        let markdownPattern = #"!\[[^\]]*\]\(\#(NSRegularExpression.escapedPattern(for: urlString))\)\s*"#
        if let regex = try? NSRegularExpression(pattern: markdownPattern) {
            updated = regex.stringByReplacingMatches(
                in: updated,
                range: NSRange(updated.startIndex..<updated.endIndex, in: updated),
                withTemplate: ""
            )
        }

        updated = updated.replacingOccurrences(of: urlString, with: "")
        while updated.contains("\n\n\n") {
            updated = updated.replacingOccurrences(of: "\n\n\n", with: "\n\n")
        }
        return updated.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func saveLocalMediaBookmark(for url: URL) {
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }

        do {
            let data = try url.bookmarkData(
                options: .withSecurityScope,
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )
            UserDefaults.standard.set(data, forKey: localMediaBookmarkKey)
        } catch {
            NSLog("Failed to save media bookmark: \(error.localizedDescription)")
        }
    }

    static func loadLocalMedia() -> LocalMediaItem? {
        guard let data = UserDefaults.standard.data(forKey: localMediaBookmarkKey) else {
            return nil
        }

        var isStale = false
        do {
            let url = try URL(
                resolvingBookmarkData: data,
                options: .withSecurityScope,
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
            )
            if isStale {
                saveLocalMediaBookmark(for: url)
            }
            guard url.startAccessingSecurityScopedResource() else { return nil }
            guard let kind = classifyLocalFile(url: url) else {
                url.stopAccessingSecurityScopedResource()
                return nil
            }
            return LocalMediaItem(url: url, kind: kind)
        } catch {
            NSLog("Failed to resolve media bookmark: \(error.localizedDescription)")
            return nil
        }
    }

    static func clearLocalMedia() {
        if let existing = loadLocalMedia() {
            existing.url.stopAccessingSecurityScopedResource()
        }
        UserDefaults.standard.removeObject(forKey: localMediaBookmarkKey)
    }

    private static func appendRemoteURL(
        _ rawURL: String,
        to items: inout [RemoteMediaItem],
        seen: inout Set<String>
    ) {
        let trimmed = rawURL.trimmingCharacters(in: trailingPunctuation)
        guard let url = URL(string: trimmed),
              let kind = classifyMediaURL(url),
              seen.insert(trimmed).inserted else { return }
        items.append(RemoteMediaItem(id: trimmed, url: url, kind: kind))
    }
}
