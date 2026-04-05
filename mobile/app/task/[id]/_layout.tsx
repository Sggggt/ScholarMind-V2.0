import { useEffect } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTaskContext } from "@/lib/task-store";

export default function TaskLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { startTaskSync, stopTaskSync } = useTaskContext();

  useEffect(() => {
    if (!id) return;

    void startTaskSync(id);
    return () => stopTaskSync();
  }, [id, startTaskSync, stopTaskSync]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="logs" />
      <Stack.Screen name="ideas" />
      <Stack.Screen name="module/[moduleId]" />
    </Stack>
  );
}
