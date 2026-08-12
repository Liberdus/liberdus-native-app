import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_NOTIFICATION_TAP_KEY = "pending_notification_tap";

type NotificationData = Record<string, unknown>;

export interface PendingNotificationTap {
  notificationId: string | null;
  to: string;
  from: string | null;
}

const parseObject = (value: unknown): NotificationData | null => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as NotificationData;
  }

  if (typeof value !== "string") return null;

  try {
    return parseObject(JSON.parse(value));
  } catch {
    return null;
  }
};

export const createNotificationTap = (
  notificationId: string | null,
  data: NotificationData | undefined
): PendingNotificationTap | null => {
  const bodyData = parseObject(data?.body);
  const to = data?.to ?? bodyData?.to;
  const from = data?.from ?? bodyData?.from;

  if (typeof to !== "string" || to.length === 0) return null;

  return {
    notificationId,
    to,
    from: typeof from === "string" ? from : null,
  };
};

export const storePendingNotificationTap = async (
  tap: PendingNotificationTap
): Promise<void> => {
  await AsyncStorage.setItem(PENDING_NOTIFICATION_TAP_KEY, JSON.stringify(tap));
};

export const getPendingNotificationTap = async (): Promise<
  PendingNotificationTap | null
> => {
  const storedTap = parseObject(
    await AsyncStorage.getItem(PENDING_NOTIFICATION_TAP_KEY)
  );
  if (!storedTap) return null;

  const notificationId = storedTap.notificationId;
  const to = storedTap.to;
  const from = storedTap.from;

  if (
    (typeof notificationId !== "string" && notificationId !== null) ||
    typeof to !== "string" ||
    (typeof from !== "string" && from !== null)
  ) {
    return null;
  }

  return { notificationId, to, from };
};

export const clearPendingNotificationTap = async (
  notificationId: string | null
): Promise<void> => {
  const storedTap = await getPendingNotificationTap();
  if (!storedTap || storedTap.notificationId !== notificationId) return;

  await AsyncStorage.removeItem(PENDING_NOTIFICATION_TAP_KEY);
};
