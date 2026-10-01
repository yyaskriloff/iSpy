package expo.modules.ispysignaling

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.Collections
import java.util.concurrent.atomic.AtomicReference

class IspySignalingModule : Module() {
  private val serverRef = AtomicReference<SignalingServer?>(null)
  private var expectedPin: String = ""
  private var listenPort: Int = 8765
  private var discovery: LanDiscovery? = null

  private fun requireContext(): Context =
    requireNotNull(appContext.reactContext) { "React context unavailable" }

  private fun ensureDiscovery(): LanDiscovery {
    discovery?.let { return it }
    val created = LanDiscovery(
      context = requireContext(),
      onFound = { id, name, host, port ->
        sendEvent(
          "onCameraFound",
          mapOf(
            "id" to id,
            "name" to name,
            "host" to host,
            "port" to port,
          ),
        )
      },
      onLost = { id ->
        sendEvent("onCameraLost", mapOf("id" to id))
      },
      onError = { message ->
        sendEvent("onServerError", mapOf("message" to message))
      },
    )
    discovery = created
    return created
  }

  override fun definition() = ModuleDefinition {
    Name("IspySignaling")

    Events(
      "onViewerAuthenticated",
      "onViewerAnswer",
      "onViewerIce",
      "onViewerDisconnected",
      "onServerError",
      "onCameraFound",
      "onCameraLost",
    )

    AsyncFunction("startServer") { port: Int, pin: String ->
      stopServerInternal(keepDiscovery = true)
      expectedPin = pin
      listenPort = port
      val listener = object : SignalingServer.Listener {
        override fun onViewerAuthenticated(session: SignalingServer.ViewerSession) {
          sendEvent("onViewerAuthenticated", mapOf("sessionId" to session.id))
        }

        override fun onViewerAnswer(session: SignalingServer.ViewerSession, sdp: String) {
          sendEvent(
            "onViewerAnswer",
            mapOf("sessionId" to session.id, "sdp" to sdp),
          )
        }

        override fun onViewerIce(
          session: SignalingServer.ViewerSession,
          candidate: String,
          sdpMid: String?,
          sdpMLineIndex: Int?,
        ) {
          val payload = mutableMapOf<String, Any?>(
            "sessionId" to session.id,
            "candidate" to candidate,
          )
          if (sdpMid != null) payload["sdpMid"] = sdpMid
          if (sdpMLineIndex != null) payload["sdpMLineIndex"] = sdpMLineIndex
          sendEvent("onViewerIce", payload)
        }

        override fun onViewerDisconnected(session: SignalingServer.ViewerSession) {
          sendEvent("onViewerDisconnected", mapOf("sessionId" to session.id))
        }
      }

      val server = SignalingServer(expectedPin = pin, listener = listener, port = port)
      // NanoHTTPD defaults to SOCKET_READ_TIMEOUT=5000ms. That SO_TIMEOUT closes
      // idle WebSockets ~5s after ICE finishes (no more signaling traffic), which
      // the camera treats as viewer disconnect and tears down the peer connection.
      server.start(0 /* infinite read timeout */, false)
      serverRef.set(server)

      val ip = getLanIpv4()
      val url = if (ip != null) "ws://$ip:$port/ws" else "ws://0.0.0.0:$port/ws"
      StreamForegroundService.start(requireContext(), pin, url)
      mapOf(
        "port" to port,
        "pin" to pin,
        "host" to (ip ?: ""),
        "wsUrl" to url,
      )
    }

    AsyncFunction("stopServer") {
      stopServerInternal(keepDiscovery = false)
      null
    }

    AsyncFunction("startAdvertising") { name: String, port: Int ->
      ensureDiscovery().startAdvertising(name, port)
      null
    }

    AsyncFunction("stopAdvertising") {
      discovery?.stopAdvertising()
      null
    }

    AsyncFunction("startBrowse") {
      ensureDiscovery().startBrowse()
      null
    }

    AsyncFunction("stopBrowse") {
      discovery?.stopBrowse()
      null
    }

    AsyncFunction("sendToViewer") { json: String ->
      val session = serverRef.get()?.currentViewer() ?: return@AsyncFunction false
      session.sendTextRaw(json)
      true
    }

    AsyncFunction("sendOffer") { sdp: String ->
      val session = serverRef.get()?.currentViewer() ?: return@AsyncFunction false
      session.sendJson(JSONObject().put("type", "offer").put("sdp", sdp))
      true
    }

    AsyncFunction("sendIce") { candidate: String, sdpMid: String?, sdpMLineIndex: Int? ->
      val session = serverRef.get()?.currentViewer() ?: return@AsyncFunction false
      val msg = JSONObject().put("type", "ice").put("candidate", candidate)
      if (sdpMid != null) msg.put("sdpMid", sdpMid)
      if (sdpMLineIndex != null) msg.put("sdpMLineIndex", sdpMLineIndex)
      session.sendJson(msg)
      true
    }

    AsyncFunction("sendBye") {
      val session = serverRef.get()?.currentViewer() ?: return@AsyncFunction false
      session.sendJson(JSONObject().put("type", "bye"))
      true
    }

    AsyncFunction("disconnectViewer") {
      serverRef.get()?.currentViewer()?.closeQuietly()
      null
    }

    Function("getLanAddress") {
      getLanIpv4() ?: ""
    }

    Function("isServerRunning") {
      serverRef.get() != null
    }

    OnDestroy {
      stopServerInternal(keepDiscovery = false)
      discovery?.stopAll()
      discovery = null
    }
  }

  private fun stopServerInternal(keepDiscovery: Boolean) {
    try {
      serverRef.getAndSet(null)?.stop()
    } catch (_: Exception) {
    }
    try {
      StreamForegroundService.stop(requireContext())
    } catch (_: Exception) {
    }
    if (!keepDiscovery) {
      discovery?.stopAdvertising()
    }
  }

  private fun getLanIpv4(): String? {
    wifiIpFromManager()?.let { return it }
    return firstNonLoopbackIpv4()
  }

  private fun wifiIpFromManager(): String? {
    return try {
      val ctx = requireContext()
      @Suppress("DEPRECATION")
      val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      val ip = wm.connectionInfo?.ipAddress ?: return null
      if (ip == 0) return null
      String.format(
        "%d.%d.%d.%d",
        ip and 0xff,
        ip shr 8 and 0xff,
        ip shr 16 and 0xff,
        ip shr 24 and 0xff,
      )
    } catch (_: Exception) {
      null
    }
  }

  private fun firstNonLoopbackIpv4(): String? {
    return try {
      for (intf in Collections.list(NetworkInterface.getNetworkInterfaces())) {
        if (!intf.isUp || intf.isLoopback) continue
        for (addr in Collections.list(intf.inetAddresses)) {
          if (addr is Inet4Address && !addr.isLoopbackAddress) {
            return addr.hostAddress
          }
        }
      }
      null
    } catch (_: Exception) {
      null
    }
  }
}
