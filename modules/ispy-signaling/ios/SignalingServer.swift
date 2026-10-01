import CommonCrypto
import Foundation
import Network

/// Minimal WebSocket server for iSpy LAN signaling (`/ws` + `/health`).
final class SignalingServer {
  protocol Delegate: AnyObject {
    func signalingServerDidAuthenticateViewer(sessionId: String)
    func signalingServerDidReceiveAnswer(sessionId: String, sdp: String)
    func signalingServerDidReceiveIce(sessionId: String, candidate: String, sdpMid: String?, sdpMLineIndex: Int?)
    func signalingServerDidDisconnectViewer(sessionId: String)
  }

  weak var delegate: Delegate?
  private let expectedPin: String
  private let port: UInt16
  private var listener: NWListener?
  private var connections: [ObjectIdentifier: ViewerConnection] = [:]
  private var activeViewerId: ObjectIdentifier?
  private let queue = DispatchQueue(label: "ispy.signaling")

  init(pin: String, port: UInt16) {
    self.expectedPin = pin
    self.port = port
  }

  func start() throws {
    let params = NWParameters.tcp
    let listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
    self.listener = listener
    listener.newConnectionHandler = { [weak self] connection in
      self?.accept(connection)
    }
    listener.stateUpdateHandler = { state in
      if case let .failed(error) = state {
        NSLog("IspySignaling listener failed: %@", "\(error)")
      }
    }
    listener.start(queue: queue)
  }

  func stop() {
    queue.async {
      self.activeViewerId = nil
      for (_, conn) in self.connections {
        conn.close()
      }
      self.connections.removeAll()
      self.listener?.cancel()
      self.listener = nil
    }
  }

  var hasViewer: Bool {
    queue.sync { activeViewerId != nil }
  }

  func sendToActiveViewer(_ text: String) -> Bool {
    queue.sync {
      guard let id = activeViewerId, let conn = connections[id] else { return false }
      conn.sendText(text)
      return true
    }
  }

  func disconnectActiveViewer() {
    queue.async {
      guard let id = self.activeViewerId, let conn = self.connections[id] else { return }
      conn.close()
    }
  }

  private func accept(_ connection: NWConnection) {
    let viewer = ViewerConnection(connection: connection, expectedPin: expectedPin, queue: queue)
    let id = ObjectIdentifier(viewer)
    connections[id] = viewer
    viewer.onClose = { [weak self] in
      guard let self else { return }
      self.queue.async {
        if self.activeViewerId == id {
          self.activeViewerId = nil
          self.delegate?.signalingServerDidDisconnectViewer(sessionId: viewer.sessionId)
        }
        self.connections.removeValue(forKey: id)
      }
    }
    viewer.onAuthenticated = { [weak self] in
      guard let self else { return }
      self.queue.async {
        if self.activeViewerId != nil {
          viewer.sendJSON([
            "type": "error",
            "code": "busy",
            "message": "viewer already connected",
          ])
          viewer.close()
          return
        }
        self.activeViewerId = id
        viewer.sendJSON([
          "type": "welcome",
          "role": "camera",
        ])
        self.delegate?.signalingServerDidAuthenticateViewer(sessionId: viewer.sessionId)
      }
    }
    viewer.onAnswer = { [weak self] sdp in
      self?.delegate?.signalingServerDidReceiveAnswer(sessionId: viewer.sessionId, sdp: sdp)
    }
    viewer.onIce = { [weak self] candidate, mid, index in
      self?.delegate?.signalingServerDidReceiveIce(
        sessionId: viewer.sessionId,
        candidate: candidate,
        sdpMid: mid,
        sdpMLineIndex: index
      )
    }
    viewer.start()
  }
}

private final class ViewerConnection {
  let sessionId: String
  private let connection: NWConnection
  private let expectedPin: String
  private let queue: DispatchQueue
  private var buffer = Data()
  private var isWebSocket = false
  private var authenticated = false

  var onAuthenticated: (() -> Void)?
  var onAnswer: ((String) -> Void)?
  var onIce: ((String, String?, Int?) -> Void)?
  var onClose: (() -> Void)?

  init(connection: NWConnection, expectedPin: String, queue: DispatchQueue) {
    self.connection = connection
    self.expectedPin = expectedPin
    self.queue = queue
    self.sessionId = UUID().uuidString
  }

  func start() {
    connection.stateUpdateHandler = { [weak self] state in
      if case .failed = state {
        self?.close()
      }
      if case .cancelled = state {
        self?.onClose?()
      }
    }
    connection.start(queue: queue)
    receive()
  }

  func close() {
    connection.cancel()
  }

  func sendText(_ text: String) {
    guard isWebSocket else { return }
    guard let payload = text.data(using: .utf8) else { return }
    var frame = Data()
    frame.append(0x81) // FIN + text
    if payload.count < 126 {
      frame.append(UInt8(payload.count))
    } else if payload.count <= 0xFFFF {
      frame.append(126)
      frame.append(UInt8((payload.count >> 8) & 0xFF))
      frame.append(UInt8(payload.count & 0xFF))
    } else {
      frame.append(127)
      var len = UInt64(payload.count).bigEndian
      withUnsafeBytes(of: &len) { frame.append(contentsOf: $0) }
    }
    frame.append(payload)
    connection.send(content: frame, completion: .contentProcessed { _ in })
  }

  func sendJSON(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let text = String(data: data, encoding: .utf8) else { return }
    sendText(text)
  }

  private func receive() {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
      guard let self else { return }
      if let data, !data.isEmpty {
        self.buffer.append(data)
        self.processBuffer()
      }
      if isComplete || error != nil {
        self.close()
        return
      }
      self.receive()
    }
  }

  private func processBuffer() {
    if !isWebSocket {
      guard let range = buffer.range(of: Data([13, 10, 13, 10])) else { return }
      let headerData = buffer.subdata(in: 0..<range.lowerBound)
      buffer.removeSubrange(0..<range.upperBound)
      handleHttp(headerData)
      return
    }
    while let frame = decodeFrame() {
      handleFrame(frame)
    }
  }

  private func handleHttp(_ headerData: Data) {
    guard let request = String(data: headerData, encoding: .utf8) else {
      close()
      return
    }
    let lines = request.split(separator: "\r\n")
    let requestLine = lines.first.map(String.init) ?? ""
    if requestLine.hasPrefix("GET /health") {
      let body = #"{"ok":true,"service":"ispy"}"#
      let response = """
      HTTP/1.1 200 OK\r
      Content-Type: application/json\r
      Content-Length: \(body.utf8.count)\r
      Connection: close\r
      \r
      \(body)
      """
      connection.send(content: response.data(using: .utf8), completion: .contentProcessed { [weak self] _ in
        self?.close()
      })
      return
    }

    let lower = request.lowercased()
    if requestLine.hasPrefix("GET /ws") || lower.contains("upgrade: websocket") {
      var key: String?
      for line in lines {
        let s = String(line)
        if s.lowercased().hasPrefix("sec-websocket-key:") {
          key = s.split(separator: ":", maxSplits: 1).last?
            .trimmingCharacters(in: .whitespaces)
        }
      }
      guard let key else {
        close()
        return
      }
      let accept = Self.makeAcceptKey(key)
      let response = """
      HTTP/1.1 101 Switching Protocols\r
      Upgrade: websocket\r
      Connection: Upgrade\r
      Sec-WebSocket-Accept: \(accept)\r
      \r

      """
      connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in })
      isWebSocket = true
      return
    }

    let body = "Not found"
    let response = """
    HTTP/1.1 404 Not Found\r
    Content-Type: text/plain\r
    Content-Length: \(body.utf8.count)\r
    Connection: close\r
    \r
    \(body)
    """
    connection.send(content: response.data(using: .utf8), completion: .contentProcessed { [weak self] _ in
      self?.close()
    })
  }

  private struct Frame {
    let opcode: UInt8
    let payload: Data
  }

  private func decodeFrame() -> Frame? {
    guard buffer.count >= 2 else { return nil }
    let b0 = buffer[0]
    let b1 = buffer[1]
    let opcode = b0 & 0x0F
    let masked = (b1 & 0x80) != 0
    var len = Int(b1 & 0x7F)
    var offset = 2
    if len == 126 {
      guard buffer.count >= 4 else { return nil }
      len = (Int(buffer[2]) << 8) | Int(buffer[3])
      offset = 4
    } else if len == 127 {
      guard buffer.count >= 10 else { return nil }
      len = 0
      for i in 0..<8 {
        len = (len << 8) | Int(buffer[2 + i])
      }
      offset = 10
    }
    let maskLen = masked ? 4 : 0
    guard buffer.count >= offset + maskLen + len else { return nil }
    var payload = Data(count: len)
    if masked {
      let mask = Array(buffer[offset..<(offset + 4)])
      let start = offset + 4
      for i in 0..<len {
        payload[i] = buffer[start + i] ^ mask[i % 4]
      }
      buffer.removeSubrange(0..<(start + len))
    } else {
      let start = offset
      payload = buffer.subdata(in: start..<(start + len))
      buffer.removeSubrange(0..<(start + len))
    }
    return Frame(opcode: opcode, payload: payload)
  }

  private func handleFrame(_ frame: Frame) {
    switch frame.opcode {
    case 0x1: // text
      guard let text = String(data: frame.payload, encoding: .utf8) else { return }
      handleText(text)
    case 0x8: // close
      close()
    case 0x9: // ping -> pong
      var pong = Data([0x8A, UInt8(min(frame.payload.count, 125))])
      pong.append(frame.payload.prefix(125))
      connection.send(content: pong, completion: .contentProcessed { _ in })
    default:
      break
    }
  }

  private func handleText(_ text: String) {
    guard let data = text.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let type = json["type"] as? String else {
      sendJSON(["type": "error", "code": "invalid", "message": "invalid"])
      return
    }

    switch type {
    case "hello":
      let role = json["role"] as? String ?? ""
      let pin = json["pin"] as? String ?? ""
      if role != "viewer" {
        sendJSON(["type": "error", "code": "invalid", "message": "role must be viewer"])
        close()
        return
      }
      if pin != expectedPin {
        sendJSON(["type": "error", "code": "bad_pin", "message": "PIN rejected"])
        close()
        return
      }
      authenticated = true
      onAuthenticated?()
    case "answer":
      guard authenticated, let sdp = json["sdp"] as? String, !sdp.isEmpty else { return }
      onAnswer?(sdp)
    case "ice":
      guard authenticated, let candidate = json["candidate"] as? String, !candidate.isEmpty else { return }
      let mid = json["sdpMid"] as? String
      let index = json["sdpMLineIndex"] as? Int
      onIce?(candidate, mid, index)
    default:
      sendJSON(["type": "error", "code": "invalid", "message": "unknown type"])
    }
  }

  private static func makeAcceptKey(_ key: String) -> String {
    let magic = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA1_DIGEST_LENGTH))
    let data = Array(magic.utf8)
    data.withUnsafeBytes { buffer in
      _ = CC_SHA1(buffer.baseAddress, CC_LONG(data.count), &digest)
    }
    return Data(digest).base64EncodedString()
  }
}
