export const ANDROID_INCOMING_CALL_TIMEOUT_MS = 60 * 1000; // 1 minute
export const BACKGROUND_CALL_EXPIRY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export interface CallData {
  callerName: string;
  callId: string;
  sentAt: string;
  hasVideo: boolean;
}

export const callKeepOptions = {
  ios: {
    appName: "Liberdus",
    maximumCallGroups: "1",
    maximumCallsPerCallGroup: "1",
    supportsVideo: false,
    includesCallsInRecents: true,
  },
  android: {
    alertTitle: "Phone call permissions",
    alertDescription: "This application needs access to manage phone calls",
    cancelButton: "Cancel",
    okButton: "OK",
    additionalPermissions: [],
    selfManaged: false,
    // Add foreground service configuration for Android 10+
    foregroundService: {
      channelId: "com.liberdus.callkeep",
      channelName: "Liberdus Background Call Service",
      notificationTitle: "Liberdus is handling calls",
      notificationIcon: "ic_launcher", // Uses your app icon
    },
  },
};

export const isStaleCallNotification = (callData: CallData): boolean => {
  if (!callData.sentAt) {
    console.log(
      `📵 Background: Rejecting call with missing sentAt timestamp - sentAt: ${callData.sentAt}`
    );
    return true;
  }
  const sentAtTimestamp = Date.parse(callData.sentAt);

  // If we can't get timestamp from notification data, reject the call
  if (!Number.isFinite(sentAtTimestamp)) {
    console.log(
      `📵 Background: Rejecting call with invalid sentAt timestamp - sentAt: ${callData.sentAt}`
    );
    return true;
  }

  const ageMs = Date.now() - sentAtTimestamp;
  if (ageMs > BACKGROUND_CALL_EXPIRY_THRESHOLD_MS) {
    console.log(
      `📵 Background: Ignoring stale call notification ${
        callData?.callId || ""
      } (age ${Math.round(ageMs / 1000)}s)`
    );
    return true;
  }

  console.log(
    `✅ Background: Call timestamp valid (age ${Math.round(ageMs / 1000)}s)`
  );
  return false;
};