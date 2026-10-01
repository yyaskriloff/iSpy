package expo.modules.ispysignaling

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoWSD
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.atomic.AtomicReference

/**
 * Embedded HTTP + WebSocket signaling. Exchanges SDP/ICE over `/ws`.
 * No HTML viewer — in-app clients only.
 */
class SignalingServer(
  private val expectedPin: String,
  private val listener: Listener,
  hostname: String = "0.0.0.0",
  port: Int = 8765,
) : NanoWSD(hostname, port) {

  interface Listener {
    fun onViewerAuthenticated(session: ViewerSession)
    fun onViewerAnswer(session: ViewerSession, sdp: String)
    fun onViewerIce(session: ViewerSession, candidate: String, sdpMid: String?, sdpMLineIndex: Int?)
    fun onViewerDisconnected(session: ViewerSession)
  }

  class ViewerSession(
    private val sendText: (String) -> Unit,
    private val closeSocket: () -> Unit,
    val id: String,
  ) {
    fun sendJson(json: JSONObject) {
      sendText(json.toString())
    }

    fun sendTextRaw(text: String) {
      sendText(text)
    }

    fun closeQuietly() {
      closeSocket()
    }
  }

  private val activeViewer = AtomicReference<ViewerSession?>(null)

  fun currentViewer(): ViewerSession? = activeViewer.get()

  fun clearViewer(session: ViewerSession) {
    activeViewer.compareAndSet(session, null)
  }

  override fun openWebSocket(handshake: IHTTPSession): WebSocket {
    return ViewerSocket(handshake)
  }

  override fun serve(session: IHTTPSession): Response {
    if (isWebsocketRequested(session)) {
      return super.serve(session)
    }
    return when (session.uri.substringBefore('?')) {
      "/health" -> newFixedLengthResponse(
        Response.Status.OK,
        "application/json",
        """{"ok":true,"service":"ispy"}""",
      )
      else -> newFixedLengthResponse(
        Response.Status.NOT_FOUND,
        NanoHTTPD.MIME_PLAINTEXT,
        "Not found",
      )
    }
  }

  private inner class ViewerSocket(handshake: IHTTPSession) : WebSocket(handshake) {
    private var session: ViewerSession? = null
    private var authenticated = false

    fun sendSafe(text: String) {
      try {
        send(text)
      } catch (e: IOException) {
        Log.w(TAG, "WS send failed", e)
      }
    }

    override fun onOpen() {
      Log.i(TAG, "WS open from ${handshakeRequest.remoteIpAddress}")
    }

    override fun onClose(
      code: WebSocketFrame.CloseCode?,
      reason: String?,
      initiatedByRemote: Boolean,
    ) {
      Log.i(TAG, "WS close code=$code reason=$reason remote=$initiatedByRemote")
      val s = session
      if (s != null) {
        activeViewer.compareAndSet(s, null)
        listener.onViewerDisconnected(s)
      }
      session = null
      authenticated = false
    }

    override fun onMessage(message: WebSocketFrame) {
      val text = message.textPayload ?: return
      try {
        handleText(text)
      } catch (e: Exception) {
        Log.e(TAG, "Bad signaling message", e)
        sendSafe(
          JSONObject()
            .put("type", "error")
            .put("code", "invalid")
            .put("message", e.message ?: "invalid")
            .toString(),
        )
      }
    }

    override fun onPong(pong: WebSocketFrame?) {}

    override fun onException(exception: IOException?) {
      Log.w(TAG, "WS exception", exception)
    }

    private fun handleText(text: String) {
      val json = JSONObject(text)
      when (json.optString("type")) {
        "hello" -> handleHello(json)
        "answer" -> {
          val s = session
          if (!authenticated || s == null) return
          val sdp = json.optString("sdp")
          if (sdp.isNotBlank()) listener.onViewerAnswer(s, sdp)
        }
        "ice" -> {
          val s = session
          if (!authenticated || s == null) return
          val candidate = json.optString("candidate")
          if (candidate.isBlank()) return
          val mid = if (json.has("sdpMid")) json.optString("sdpMid") else null
          val index = if (json.has("sdpMLineIndex")) json.optInt("sdpMLineIndex") else null
          listener.onViewerIce(s, candidate, mid, index)
        }
        else -> {
          sendSafe(
            JSONObject()
              .put("type", "error")
              .put("code", "invalid")
              .put("message", "unknown type")
              .toString(),
          )
        }
      }
    }

    private fun handleHello(json: JSONObject) {
      val role = json.optString("role")
      val pin = json.optString("pin")
      if (role != "viewer") {
        sendSafe(
          JSONObject()
            .put("type", "error")
            .put("code", "invalid")
            .put("message", "role must be viewer")
            .toString(),
        )
        close(WebSocketFrame.CloseCode.PolicyViolation, "bad role", false)
        return
      }
      if (pin != expectedPin) {
        sendSafe(
          JSONObject()
            .put("type", "error")
            .put("code", "bad_pin")
            .put("message", "PIN rejected")
            .toString(),
        )
        close(WebSocketFrame.CloseCode.PolicyViolation, "bad pin", false)
        return
      }

      val existing = activeViewer.get()
      if (existing != null) {
        sendSafe(
          JSONObject()
            .put("type", "error")
            .put("code", "busy")
            .put("message", "viewer already connected")
            .toString(),
        )
        close(WebSocketFrame.CloseCode.PolicyViolation, "busy", false)
        return
      }

      val s = ViewerSession(
        sendText = { text -> sendSafe(text) },
        closeSocket = {
          try {
            close(WebSocketFrame.CloseCode.NormalClosure, "done", false)
          } catch (_: Exception) {
          }
        },
        id = Integer.toHexString(System.identityHashCode(this)),
      )
      if (!activeViewer.compareAndSet(null, s)) {
        sendSafe(
          JSONObject()
            .put("type", "error")
            .put("code", "busy")
            .put("message", "viewer already connected")
            .toString(),
        )
        close(WebSocketFrame.CloseCode.PolicyViolation, "busy", false)
        return
      }

      session = s
      authenticated = true
      sendSafe(
        JSONObject()
          .put("type", "welcome")
          .put("role", "camera")
          .toString(),
      )
      Log.i(TAG, "Viewer authenticated id=${s.id}")
      listener.onViewerAuthenticated(s)
    }
  }

  companion object {
    private const val TAG = "IspySignaling"
  }
}
