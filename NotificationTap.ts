import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_NOTIFICATION_TAP_KEY = "pending_notification_tap";
const MAX_PENDING_NOTIFICATION_TAPS = 20;

type NotificationData = Record<string, unknown>;
type StoredNotificationTaps = Record<string, string>;

let pendingTapStorageQueue: Promise<void> = Promise.resolve();

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
  if (typeof data?.to === "string" && data.to.length > 0) {
    return { notificationId, to: data.to };
  }

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

const withPendingTapStorage = <T>(
  operation: () => Promise<T>
): Promise<T> => {
  const result = pendingTapStorageQueue.then(operation);
  pendingTapStorageQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};

const getStoredNotificationTaps = async (): Promise<StoredNotificationTaps> => {
  const storedValue = await AsyncStorage.getItem(PENDING_NOTIFICATION_TAP_KEY);
  if (!storedValue) return {};

  try {
    const storedTaps: unknown = JSON.parse(storedValue);
    if (!isRecord(storedTaps)) return {};

    return Object.fromEntries(
      Object.entries(storedTaps).filter(
        ([notificationId, to]) =>
          notificationId.length > 0 && typeof to === "string" && to.length > 0
      )
    ) as StoredNotificationTaps;
  } catch {
    return {};
  }
};

export const storePendingNotificationTap = (
  tap: PendingNotificationTap
): Promise<void> =>
  withPendingTapStorage(async () => {
    const storedTaps = await getStoredNotificationTaps();
    delete storedTaps[tap.notificationId];
    storedTaps[tap.notificationId] = tap.to;

    await AsyncStorage.setItem(
      PENDING_NOTIFICATION_TAP_KEY,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(storedTaps).slice(-MAX_PENDING_NOTIFICATION_TAPS)
        )
      )
    );
  });

export const getPendingNotificationTap = (
  notificationId: string
): Promise<PendingNotificationTap | null> =>
  withPendingTapStorage(async () => {
    const to = (await getStoredNotificationTaps())[notificationId];
    return to ? { notificationId, to } : null;
  });

export const clearPendingNotificationTap = (
  notificationId: string
): Promise<void> =>
  withPendingTapStorage(async () => {
    const storedTaps = await getStoredNotificationTaps();
    if (!(notificationId in storedTaps)) return;

    delete storedTaps[notificationId];
    if (Object.keys(storedTaps).length > 0) {
      await AsyncStorage.setItem(
        PENDING_NOTIFICATION_TAP_KEY,
        JSON.stringify(storedTaps)
      );
    } else {
      await AsyncStorage.removeItem(PENDING_NOTIFICATION_TAP_KEY);
    }
  });
