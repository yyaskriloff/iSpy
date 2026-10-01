package expo.modules.ispysignaling

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import java.util.concurrent.ConcurrentHashMap

/**
 * mDNS advertise + browse for `_ispy._tcp`. TXT carries port only — never the PIN.
 */
class LanDiscovery(
  private val context: Context,
  private val onFound: (id: String, name: String, host: String, port: Int) -> Unit,
  private val onLost: (id: String) -> Unit,
  private val onError: (message: String) -> Unit,
) {
  private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
  private var registrationListener: NsdManager.RegistrationListener? = null
  private var discoveryListener: NsdManager.DiscoveryListener? = null
  private val resolved = ConcurrentHashMap<String, Boolean>()

  fun startAdvertising(name: String, port: Int) {
    stopAdvertising()
    val serviceInfo = NsdServiceInfo().apply {
      serviceName = sanitizeName(name)
      serviceType = SERVICE_TYPE
      setPort(port)
      setAttribute("port", port.toString())
      setAttribute("ver", "1")
    }

    val listener = object : NsdManager.RegistrationListener {
      override fun onServiceRegistered(info: NsdServiceInfo) {
        Log.i(TAG, "Registered ${info.serviceName}")
      }

      override fun onRegistrationFailed(info: NsdServiceInfo, errorCode: Int) {
        onError("NSD registration failed: $errorCode")
      }

      override fun onServiceUnregistered(info: NsdServiceInfo) {
        Log.i(TAG, "Unregistered ${info.serviceName}")
      }

      override fun onUnregistrationFailed(info: NsdServiceInfo, errorCode: Int) {
        Log.w(TAG, "Unregistration failed: $errorCode")
      }
    }
    registrationListener = listener
    try {
      nsdManager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, listener)
    } catch (e: Exception) {
      onError(e.message ?: "registerService failed")
    }
  }

  fun stopAdvertising() {
    val listener = registrationListener ?: return
    try {
      nsdManager.unregisterService(listener)
    } catch (_: Exception) {
    }
    registrationListener = null
  }

  fun startBrowse() {
    stopBrowse()
    resolved.clear()
    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(serviceType: String) {
        Log.i(TAG, "Discovery started $serviceType")
      }

      override fun onServiceFound(service: NsdServiceInfo) {
        if (!service.serviceType.contains("ispy")) return
        resolve(service)
      }

      override fun onServiceLost(service: NsdServiceInfo) {
        val id = serviceKey(service.serviceName ?: "camera", null, 0)
        // Also try to remove any host-qualified keys that start with this name.
        val toRemove = resolved.keys.filter { it.startsWith(service.serviceName ?: "") }
        if (toRemove.isEmpty()) {
          onLost(id)
        } else {
          toRemove.forEach {
            resolved.remove(it)
            onLost(it)
          }
        }
      }

      override fun onDiscoveryStopped(serviceType: String) {
        Log.i(TAG, "Discovery stopped")
      }

      override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
        onError("NSD discovery start failed: $errorCode")
      }

      override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
        Log.w(TAG, "Stop discovery failed: $errorCode")
      }
    }
    discoveryListener = listener
    try {
      nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
    } catch (e: Exception) {
      onError(e.message ?: "discoverServices failed")
    }
  }

  fun stopBrowse() {
    val listener = discoveryListener ?: return
    try {
      nsdManager.stopServiceDiscovery(listener)
    } catch (_: Exception) {
    }
    discoveryListener = null
    resolved.clear()
  }

  fun stopAll() {
    stopBrowse()
    stopAdvertising()
  }

  private fun resolve(service: NsdServiceInfo) {
    val resolveListener = object : NsdManager.ResolveListener {
      override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
        Log.w(TAG, "Resolve failed ${serviceInfo.serviceName}: $errorCode")
      }

      override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
        val host = serviceInfo.host?.hostAddress ?: return
        val port = serviceInfo.port
        val name = serviceInfo.serviceName ?: "iSpy Camera"
        val id = serviceKey(name, host, port)
        if (resolved.put(id, true) == true) return
        onFound(id, name, host, port)
      }
    }
    try {
      @Suppress("DEPRECATION")
      nsdManager.resolveService(service, resolveListener)
    } catch (e: Exception) {
      onError(e.message ?: "resolveService failed")
    }
  }

  companion object {
    private const val TAG = "IspyLanDiscovery"
    const val SERVICE_TYPE = "_ispy._tcp."

    fun sanitizeName(name: String): String {
      val trimmed = name.trim().ifEmpty { "iSpy Camera" }
      return trimmed.take(60)
    }

    fun serviceKey(name: String, host: String?, port: Int): String {
      return if (host.isNullOrBlank()) name else "$name@$host:$port"
    }
  }
}
