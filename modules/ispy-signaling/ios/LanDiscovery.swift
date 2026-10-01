import Foundation
import ObjectiveC

/// mDNS advertise + browse for `_ispy._tcp`. TXT carries port only — never the PIN.
final class LanDiscovery: NSObject {
  static let serviceType = "_ispy._tcp."

  private var netService: NetService?
  private var browser: NetServiceBrowser?
  private var pendingServices: [ObjectIdentifier: NetService] = [:]
  private var knownIds = Set<String>()

  var onFound: ((String, String, String, Int) -> Void)?
  var onLost: ((String) -> Void)?
  var onError: ((String) -> Void)?

  func startAdvertising(name: String, port: Int) {
    stopAdvertising()
    let service = NetService(
      domain: "local.",
      type: Self.serviceType,
      name: Self.sanitizeName(name),
      port: Int32(port)
    )
    service.delegate = self
    let txt: [String: Data] = [
      "port": Data("\(port)".utf8),
      "ver": Data("1".utf8),
    ]
    service.setTXTRecord(NetService.data(fromTXTRecord: txt))
    service.publish()
    netService = service
  }

  func stopAdvertising() {
    netService?.stop()
    netService = nil
  }

  func startBrowse() {
    stopBrowse()
    knownIds.removeAll()
    let browser = NetServiceBrowser()
    browser.delegate = self
    browser.searchForServices(ofType: Self.serviceType, inDomain: "local.")
    self.browser = browser
  }

  func stopBrowse() {
    browser?.stop()
    browser = nil
    pendingServices.removeAll()
  }

  func stopAll() {
    stopBrowse()
    stopAdvertising()
  }

  private static func sanitizeName(_ name: String) -> String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let base = trimmed.isEmpty ? "iSpy Camera" : trimmed
    return String(base.prefix(60))
  }

  private func serviceId(name: String, host: String, port: Int) -> String {
    "\(name)@\(host):\(port)"
  }

  private func ipv4Host(from service: NetService) -> String? {
    guard let addresses = service.addresses else {
      return trimmedHostName(service.hostName)
    }
    for address in addresses {
      let ip: String? = address.withUnsafeBytes { raw -> String? in
        guard let base = raw.bindMemory(to: sockaddr.self).baseAddress else { return nil }
        guard base.pointee.sa_family == sa_family_t(AF_INET) else { return nil }
        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        let result = getnameinfo(
          base,
          socklen_t(address.count),
          &hostname,
          socklen_t(hostname.count),
          nil,
          0,
          NI_NUMERICHOST
        )
        guard result == 0 else { return nil }
        let value = String(cString: hostname)
        return value.isEmpty ? nil : value
      }
      if let ip { return ip }
    }
    return trimmedHostName(service.hostName)
  }

  private func trimmedHostName(_ hostName: String?) -> String? {
    guard let hostName else { return nil }
    return hostName
      .replacingOccurrences(of: ".local.", with: "")
      .replacingOccurrences(of: ".local", with: "")
  }
}

extension LanDiscovery: NetServiceDelegate {
  func netServiceDidPublish(_ sender: NetService) {
    NSLog("IspyLanDiscovery published %@", sender.name)
  }

  func netService(_ sender: NetService, didNotPublish errorDict: [String: NSNumber]) {
    onError?("Bonjour publish failed: \(errorDict)")
  }

  func netServiceDidResolveAddress(_ sender: NetService) {
    pendingServices.removeValue(forKey: ObjectIdentifier(sender))
    guard let host = ipv4Host(from: sender) else { return }
    let port = sender.port
    guard port > 0 else { return }
    let name = sender.name
    let id = serviceId(name: name, host: host, port: port)
    if knownIds.contains(id) { return }
    knownIds.insert(id)
    onFound?(id, name, host, port)
  }

  func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
    pendingServices.removeValue(forKey: ObjectIdentifier(sender))
    NSLog("IspyLanDiscovery resolve failed %@", "\(errorDict)")
  }
}

extension LanDiscovery: NetServiceBrowserDelegate {
  func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
    pendingServices[ObjectIdentifier(service)] = service
    service.delegate = self
    service.resolve(withTimeout: 5)
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
    pendingServices.removeValue(forKey: ObjectIdentifier(service))
    let host = service.hostName?
      .replacingOccurrences(of: ".local.", with: "")
      .replacingOccurrences(of: ".local", with: "") ?? ""
    let id = serviceId(name: service.name, host: host, port: service.port)
    knownIds.remove(id)
    onLost?(id)
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
    onError?("Bonjour browse failed: \(errorDict)")
  }
}
