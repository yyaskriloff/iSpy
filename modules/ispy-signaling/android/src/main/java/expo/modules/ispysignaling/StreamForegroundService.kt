package expo.modules.ispysignaling

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Keeps camera/mic streaming alive with a partial wake lock while screen is off.
 */
class StreamForegroundService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }

    val pin = intent?.getStringExtra(EXTRA_PIN).orEmpty()
    val url = intent?.getStringExtra(EXTRA_URL).orEmpty()
    ensureChannel()
    val notification = buildNotification(pin, url)
    val type =
      ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    acquireWakeLock()
    return START_STICKY
  }

  override fun onDestroy() {
    releaseWakeLock()
    super.onDestroy()
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ispy:stream").also {
      it.setReferenceCounted(false)
      it.acquire()
    }
  }

  private fun releaseWakeLock() {
    try {
      if (wakeLock?.isHeld == true) wakeLock?.release()
    } catch (_: Exception) {
    }
    wakeLock = null
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      "iSpy stream",
      NotificationManager.IMPORTANCE_LOW,
    )
    nm.createNotificationChannel(channel)
  }

  private fun buildNotification(pin: String, url: String): Notification {
    val stopIntent = Intent(this, StreamForegroundService::class.java).apply {
      action = ACTION_STOP
    }
    val stopPending = PendingIntent.getService(
      this,
      0,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val body = buildString {
      append("Streaming")
      if (url.isNotBlank()) append(" · $url")
      if (pin.isNotBlank()) append(" · PIN $pin")
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("iSpy Camera")
      .setContentText(body)
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setOngoing(true)
      .addAction(0, "Stop", stopPending)
      .build()
  }

  companion object {
    const val CHANNEL_ID = "ispy_stream"
    const val NOTIFICATION_ID = 42
    const val ACTION_STOP = "expo.modules.ispysignaling.STOP"
    const val EXTRA_PIN = "pin"
    const val EXTRA_URL = "url"

    fun start(context: Context, pin: String, url: String) {
      val intent = Intent(context, StreamForegroundService::class.java).apply {
        putExtra(EXTRA_PIN, pin)
        putExtra(EXTRA_URL, url)
      }
      context.startForegroundService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, StreamForegroundService::class.java))
    }
  }
}
