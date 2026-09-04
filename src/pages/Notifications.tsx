import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/useNotifications";
import { Bell, BellOff, CheckCheck, HandCoins, Users, ArrowLeftRight, Trash2, Eraser } from "lucide-react";

const icons: Record<string, typeof Bell> = {
  loan: HandCoins,
  guarantor: Users,
  transaction: ArrowLeftRight,
  general: Bell,
};

export default function Notifications() {
  const { items, unread, loading, markRead, markAllRead } = useNotifications();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Loan decisions, guarantor requests and wallet activity.</p>
        </div>
        <Button variant="outline" onClick={markAllRead} disabled={!unread}>
          <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
        </Button>
      </div>

      <Card className="p-6 shadow-card">
        <div className="mb-4 flex items-center gap-2">
          <h4 className="font-display text-lg font-semibold">Inbox</h4>
          {unread > 0 && <Badge variant="secondary">{unread} unread</Badge>}
        </div>
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <BellOff className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">You're all caught up</p>
            <p className="mt-1 text-xs text-muted-foreground">Deposits, loan decisions and guarantor requests will show up here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map(n => {
              const Icon = icons[n.category] || Bell;
              return (
                <li key={n.id} className={`flex items-start gap-3 py-4 ${n.read_at ? "" : "bg-accent-soft/40"}`}>
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium capitalize">{n.title}</p>
                      {!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                    </div>
                    {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {n.link && (
                      <Button size="sm" variant="ghost" asChild onClick={() => !n.read_at && markRead(n.id)}>
                        <Link to={n.link}>View</Link>
                      </Button>
                    )}
                    {!n.read_at && <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Mark read</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
