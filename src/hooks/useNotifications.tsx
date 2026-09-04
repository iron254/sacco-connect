import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Notification = {
  id: string;
  title: string;
  body: string | null;
  category: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, title, body, category, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) console.error("Failed to load notifications:", error.message);
    setItems((data || []) as Notification[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-feed-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    // Polling fallback in case the realtime socket drops
    const timer = window.setInterval(() => load(), 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, load]);

  const unread = items.filter(n => !n.read_at).length;

  const markRead = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => (n.id === id ? { ...n, read_at: n.read_at ?? now } : n)));
    const { error } = await supabase.from("notifications").update({ read_at: now }).eq("id", id).is("read_at", null);
    if (error) { console.error("Failed to mark notification read:", error.message); load(); }
  }, [load]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: now })));
    const { error } = await supabase.from("notifications").update({ read_at: now }).eq("user_id", user.id).is("read_at", null);
    if (error) { console.error("Failed to mark all read:", error.message); load(); }
  }, [user, load]);

  const remove = useCallback(async (id: string) => {
    setItems(prev => prev.filter(n => n.id !== id));
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) { console.error("Failed to delete notification:", error.message); load(); }
  }, [load]);

  const clearRead = useCallback(async () => {
    if (!user) return;
    setItems(prev => prev.filter(n => !n.read_at));
    const { error } = await supabase.from("notifications").delete().eq("user_id", user.id).not("read_at", "is", null);
    if (error) { console.error("Failed to clear notifications:", error.message); load(); }
  }, [user, load]);

  return { items, unread, loading, load, markRead, markAllRead, remove, clearRead };
}
