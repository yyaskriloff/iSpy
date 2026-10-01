const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins')

/**
 * Allow cleartext LAN HTTP/WS and ensure camera|microphone FGS types are present.
 */
function withIspyAndroid(config) {
  return withAndroidManifest(config, config => {
    const manifest = config.modResults
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)
    app.$['android:usesCleartextTraffic'] = 'true'

    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = []
    }
    const needed = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_CAMERA',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.WAKE_LOCK',
      'android.permission.POST_NOTIFICATIONS'
    ]
    const existing = new Set(manifest.manifest['uses-permission'].map(p => p.$['android:name']))
    for (const name of needed) {
      if (!existing.has(name)) {
        manifest.manifest['uses-permission'].push({ $: { 'android:name': name } })
      }
    }

    return config
  })
}

module.exports = withIspyAndroid
