import CommonCrypto
import ExpoModulesCore
import Foundation
import Network

public class IspySignalingModule: Module {
  private var server: SignalingServer?
  private var discovery: LanDiscovery?

  private func ensureDiscovery() -> LanDiscovery {
    if let discovery { return discovery }
    let created = LanDiscovery()
    created.onFound = { [weak self] id, name, host, port in
      self?.sendEvent("onCameraFound", [
        "id": id,
        "name": name,
        "host": host,
        "port": port,
      ])
    }
    created.onLost = { [weak self] id in
      self?.sendEvent("onCameraLost", ["id": id])
    }
    created.onError = { [weak self] message in
      self?.sendEvent("onServerError", ["message": message])
    }
    discovery = created
    return created
  }

  public func definition() -> ModuleDefinition {
    Name("IspySignaling")

    Events(
      "onViewerAuthenticated",
      "onViewerAnswer",
      "onViewerIce",
      "onViewerDisconnected",
      "onServerError",
      "onCameraFound",
      "onCameraLost"
    )

    AsyncFunction("startServer") { (port: Int, pin: String) -> [String: Any] in
      self.stopServerInternal(keepAdvertising: true)
      let server = SignalingServer(pin: pin, port: UInt16(port))
      server.delegate = self
      try server.start()
      self.server = server
      let host = Self.lanIpv4() ?? ""
      let wsUrl = host.isEmpty ? "ws://0.0.0.0:\(port)/ws" : "ws://\(host):\(port)/ws"
      return [
        "port": port,
        "pin": pin,
        "host": host,
        "wsUrl": wsUrl,
      ]
    }

    AsyncFunction("stopServer") { () in
      self.stopServerInternal(keepAdvertising: false)
    }

    AsyncFunction("startAdvertising") { (name: String, port: Int) in
      self.ensureDiscovery().startAdvertising(name: name, port: port)
    }

    AsyncFunction("stopAdvertising") { () in
      self.discovery?.stopAdvertising()
    }

    AsyncFunction("startBrowse") { () in
      self.ensureDiscovery().startBrowse()
    }

    AsyncFunction("stopBrowse") { () in
      self.discovery?.stopBrowse()
    }

    AsyncFunction("sendToViewer") { (json: String) -> Bool in
      self.server?.sendToActiveViewer(json) ?? false
    }

    AsyncFunction("sendOffer") { (sdp: String) -> Bool in
      let payload: [String: Any] = ["type": "offer", "sdp": sdp]
      guard let data = try? JSONSerialization.data(withJSONObject: payload),
            let text = String(data: data, encoding: .utf8) else { return false }
      return self.server?.sendToActiveViewer(text) ?? false
    }

    AsyncFunction("sendIce") { (candidate: String, sdpMid: String?, sdpMLineIndex: Int?) -> Bool in
      var payload: [String: Any] = ["type": "ice", "candidate": candidate]
      if let sdpMid { payload["sdpMid"] = sdpMid }
      if let sdpMLineIndex { payload["sdpMLineIndex"] = sdpMLineIndex }
      guard let data = try? JSONSerialization.data(withJSONObject: payload),
            let text = String(data: data, encoding: .utf8) else { return false }
      return self.server?.sendToActiveViewer(text) ?? false
    }

    AsyncFunction("sendBye") { () -> Bool in
      let payload: [String: Any] = ["type": "bye"]
      guard let data = try? JSONSerialization.data(withJSONObject: payload),
            let text = String(data: data, encoding: .utf8) else { return false }
      return self.server?.sendToActiveViewer(text) ?? false
    }

    AsyncFunction("disconnectViewer") { () in
      self.server?.disconnectActiveViewer()
    }

    Function("getLanAddress") { () -> String in
      Self.lanIpv4() ?? ""
    }

    Function("isServerRunning") { () -> Bool in
      self.server != nil
    }

    OnDestroy {
      self.stopServerInternal(keepAdvertising: false)
      self.discovery?.stopAll()
      self.discovery = nil
    }
  }

  private func stopServerInternal(keepAdvertising: Bool) {
    server?.stop()
    server = nil
    if !keepAdvertising {
      discovery?.stopAdvertising()
    }
  }

  private static func lanIpv4() -> String? {
    var address: String?
    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return nil }
    defer { freeifaddrs(ifaddr) }
    var ptr: UnsafeMutablePointer<ifaddrs>? = first
    while let iface = ptr {
      defer { ptr = iface.pointee.ifa_next }
      guard iface.pointee.ifa_addr.pointee.sa_family == UInt8(AF_INET) else { continue }
      let name = String(cString: iface.pointee.ifa_name)
      if name.hasPrefix("lo") { continue }
      var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
      getnameinfo(
        iface.pointee.ifa_addr,
        socklen_t(iface.pointee.ifa_addr.pointee.sa_len),
        &hostname,
        socklen_t(hostname.count),
        nil,
        0,
        NI_NUMERICHOST
      )
      let ip = String(cString: hostname)
      if ip.hasPrefix("127.") { continue }
      if name.hasPrefix("en") {
        return ip
      }
      if address == nil {
        address = ip
      }
    }
    return address
  }
}

extension IspySignalingModule: SignalingServer.Delegate {
  func signalingServerDidAuthenticateViewer(sessionId: String) {
    sendEvent("onViewerAuthenticated", ["sessionId": sessionId])
  }

  func signalingServerDidReceiveAnswer(sessionId: String, sdp: String) {
    sendEvent("onViewerAnswer", ["sessionId": sessionId, "sdp": sdp])
  }

  func signalingServerDidReceiveIce(sessionId: String, candidate: String, sdpMid: String?, sdpMLineIndex: Int?) {
    var payload: [String: Any] = [
      "sessionId": sessionId,
      "candidate": candidate,
    ]
    if let sdpMid { payload["sdpMid"] = sdpMid }
    if let sdpMLineIndex { payload["sdpMLineIndex"] = sdpMLineIndex }
    sendEvent("onViewerIce", payload)
  }

  func signalingServerDidDisconnectViewer(sessionId: String) {
    sendEvent("onViewerDisconnected", ["sessionId": sessionId])
  }
}
