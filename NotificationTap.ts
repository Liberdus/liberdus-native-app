import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_NOTIFICATION_TAP_KEY = "pending_notification_tap";
const MAX_PENDING_NOTIFICATION_TAPS = 20;

type NotificationData = Record<string, unknown>;

const isRecord = (value: unknown): value is NotificationData =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface PendingNotificationTap {
  notificationId: string;
  to: string;
}

export const createNotificationTap = (
  notificationId: string,
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

const parsePendingNotificationTap = (
  value: unknown
): PendingNotificationTap | null => {
  if (!isRecord(value)) return null;

  const notificationId = value.notificationId;
  const to = value.to;

  if (
    typeof notificationId !== "string" ||
    notificationId.length === 0 ||
    typeof to !== "string" ||
    to.length === 0
  ) {
    return null;
  }

  return { notificationId, to };
};

const getPendingNotificationTaps = async (): Promise<
  PendingNotificationTap[]
> => {
  const storedValue = await AsyncStorage.getItem(PENDING_NOTIFICATION_TAP_KEY);
  if (!storedValue) return [];

  let storedTaps: unknown;
  try {
    storedTaps = JSON.parse(storedValue);
  } catch {
    return [];
  }

  if (!Array.isArray(storedTaps)) return [];

  return storedTaps
    .map(parsePendingNotificationTap)
    .filter((tap): tap is PendingNotificationTap => tap !== null);
};

export const storePendingNotificationTap = async (
  tap: PendingNotificationTap
): Promise<void> => {
  const storedTaps = await getPendingNotificationTaps();
  const pendingTaps = [
    tap,
    ...storedTaps.filter(
      (storedTap) => storedTap.notificationId !== tap.notificationId
    ),
  ].slice(0, MAX_PENDING_NOTIFICATION_TAPS);

  await AsyncStorage.setItem(
    PENDING_NOTIFICATION_TAP_KEY,
    JSON.stringify(pendingTaps)
  );
};

export const getPendingNotificationTap = async (
  notificationId: string
): Promise<PendingNotificationTap | null> => {
  const storedTaps = await getPendingNotificationTaps();
  return (
    storedTaps.find((tap) => tap.notificationId === notificationId) ?? null
  );
};

export const clearPendingNotificationTap = async (
  notificationId: string
): Promise<void> => {
  const storedTaps = await getPendingNotificationTaps();
  const remainingTaps = storedTaps.filter(
    (tap) => tap.notificationId !== notificationId
  );
  if (remainingTaps.length === storedTaps.length) return;

  if (remainingTaps.length > 0) {
    await AsyncStorage.setItem(
      PENDING_NOTIFICATION_TAP_KEY,
      JSON.stringify(remainingTaps)
    );
    return;
  }

  await AsyncStorage.removeItem(PENDING_NOTIFICATION_TAP_KEY);
};
