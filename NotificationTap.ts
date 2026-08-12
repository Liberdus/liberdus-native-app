import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_NOTIFICATION_TAP_KEY = "pending_notification_tap";

type NotificationData = Record<string, unknown>;

const isRecord = (value: unknown): value is NotificationData =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface PendingNotificationTap {
  notificationId: string | null;
  to: string;
}

export const createNotificationTap = (
  notificationId: string | null,
  data: NotificationData | undefined
): PendingNotificationTap | null => {
  if (typeof data?.body !== "string") return null;

  let body: unknown;
  try {
    body = JSON.parse(data.body);
  } catch {
    return null;
  }

  if (
    !isRecord(body) ||
    body.type !== "message" ||
    typeof body.to !== "string" ||
    body.to.length === 0
  ) {
    return null;
  }

  return {
    notificationId,
    to: body.to,
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
  const storedValue = await AsyncStorage.getItem(PENDING_NOTIFICATION_TAP_KEY);
  if (!storedValue) return null;

  let storedTap: unknown;
  try {
    storedTap = JSON.parse(storedValue);
  } catch {
    return null;
  }

  if (!isRecord(storedTap)) return null;

  const notificationId = storedTap.notificationId;
  const to = storedTap.to;

  if (
    (typeof notificationId !== "string" && notificationId !== null) ||
    typeof to !== "string"
  ) {
    return null;
  }

  return { notificationId, to };
};

export const clearPendingNotificationTap = async (
  notificationId: string | null
): Promise<void> => {
  const storedTap = await getPendingNotificationTap();
  if (!storedTap || storedTap.notificationId !== notificationId) return;

  await AsyncStorage.removeItem(PENDING_NOTIFICATION_TAP_KEY);
};
