import Foundation
import Vision

struct OCRFailure: Error {
    let message: String
}

func main() throws {
    guard CommandLine.arguments.count >= 2 else {
        throw OCRFailure(message: "usage: swift extract-image-text.swift <image-path>")
    }

    let imagePath = CommandLine.arguments[1]
    let imageUrl = URL(fileURLWithPath: imagePath)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.02

    let handler = VNImageRequestHandler(url: imageUrl)
    try handler.perform([request])

    let lines = (request.results ?? [])
        .compactMap { observation in observation.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }

    FileHandle.standardOutput.write((lines.joined(separator: "\n") + "\n").data(using: .utf8)!)
}

do {
    try main()
} catch {
    let message: String
    if let failure = error as? OCRFailure {
        message = failure.message
    } else {
        message = error.localizedDescription
    }
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}
