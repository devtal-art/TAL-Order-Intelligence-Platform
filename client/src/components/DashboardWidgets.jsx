import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { keyframes } from '@emotion/react';
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AccessTimeFilledRoundedIcon from '@mui/icons-material/AccessTimeFilledRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import HelpRoundedIcon from '@mui/icons-material/HelpRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import ShoppingBagRoundedIcon from '@mui/icons-material/ShoppingBagRounded';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import UpdateRoundedIcon from '@mui/icons-material/UpdateRounded';
import TodayRoundedIcon from '@mui/icons-material/TodayRounded';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import { orderService } from '../services/orderService.js';
import { deliveryMeta, commentMeta, discountBucketMeta } from '../utils/order.js';
import { formatDaysUntil, formatDisplayDate } from '../utils/dateFormat.js';

// Dashboard widgets (V5 — MUI + Tailwind redesign). SAME information
// architecture as before, restyled only:
//   Row 2 — Total Orders (+ Email/Kumkum) | Total/Unique Items | Delivery Date.
//   Row 3 — Order (Status + Comment) | Item (Item Status + Reason) |
//           Today's Orders (value + sparkline + per-processor list).
//   Row 3.5 — Discount.
//   Row 3.7 — four Order Status stat cards (moved here, directly above Team
//             Performance, per user request — was originally Row 1/top).
//   Row 4 — Team Performance, full width.
//
// Every number/name/status here comes straight from GET /v1/orders/dashboard
// (orderService.dashboard) — nothing in this file is hardcoded. `refreshToken`
// re-fetches when it changes, same as before.
const TONE = {
  released: { main: '#059669', soft: '#ECFDF3', border: '#ABEFC6', strong: '#067647' },
  // deliveryMeta('delivered') (Item Status "Released") returns tone:
  // 'delivered' — alias it to the same green as the Order Status tone so
  // "Released" reads consistently green everywhere on the dashboard.
  delivered: { main: '#059669', soft: '#ECFDF3', border: '#ABEFC6', strong: '#067647' },
  // Order Hold shares the amber warning tone with Item Status "Half
  // Released" (tone 'half' below) — same severity, on hold/needs attention
  // rather than settled. Order Cancelled gets the red alert tone — a
  // decisive, closed-out outcome.
  hold: { main: '#F79009', soft: '#FFFAEB', border: '#FEDF89', strong: '#B54708' },
  cancelled: { main: '#D92D20', soft: '#FEF3F2', border: '#FECDCA', strong: '#B42318' },
  problem: { main: '#2F4FA2', soft: '#EDF2FA', border: '#C5D2EC', strong: '#27428C' },
  os: { main: '#F79009', soft: '#FFFAEB', border: '#FEDF89', strong: '#B54708' },
  half: { main: '#F79009', soft: '#FFFAEB', border: '#FEDF89', strong: '#B54708' },
  not: { main: '#D92D20', soft: '#FEF3F2', border: '#FECDCA', strong: '#B42318' },
  notfound: { main: '#A8A29E', soft: '#FAFAF8', border: '#E9E7E3', strong: '#57534E' },
  na: { main: '#A8A29E', soft: '#FAFAF8', border: '#E9E7E3', strong: '#57534E' },
};

const osToneKey = (status) => {
  switch (status) {
    case 'Order Released': return 'released';
    case 'Order Hold': return 'hold';
    case 'Order Cancelled': return 'cancelled';
    case 'Order Released but Problem': return 'problem';
    default: return 'na';
  }
};
const osIconFor = (status) => {
  switch (status) {
    case 'Order Released': return CheckCircleRoundedIcon;
    case 'Order Hold': return AccessTimeFilledRoundedIcon;
    case 'Order Cancelled': return CancelRoundedIcon;
    case 'Order Released but Problem': return HelpRoundedIcon;
    default: return HelpRoundedIcon;
  }
};

// Shared red palette for the Crossed Delivery Dates alert card (V5.7) —
// same red already used elsewhere on the dashboard (Order Cancelled / Not
// Released), so "overdue delivery" reads as the same severity of alert.
const RED = TONE.cancelled;

// Order Delivery Date / Crossed Delivery Dates cards (V5.5) — a fixed cap on
// the scrollable date list so the card's own size stays constant (matching
// its row neighbors) no matter how many of the up to 7 dates exist; ~3 rows
// fit before the list scrolls for the rest. Shared by both cards so they
// stay visually identical.
const DELIVERY_LIST_MAX_HEIGHT = 168;

// "Collision" hover animation for the OS Pending by Item button — two small
// circles start off the button's left/right edges and grow toward the
// center, meeting in the middle. Sized in vmax (not a fixed px) so they
// fully cover the button regardless of its own (responsive, card-driven)
// width — same effect, no dependency on knowing the button's exact size.
const collisionLeft = keyframes`
  0% { left: -20px; width: 20px; height: 20px; }
  50% { left: 50%; width: 20px; height: 20px; }
  100% { left: 50%; width: 250vmax; height: 250vmax; }
`;
const collisionRight = keyframes`
  0% { right: -20px; width: 20px; height: 20px; }
  50% { right: 50%; width: 20px; height: 20px; }
  100% { right: 50%; width: 250vmax; height: 250vmax; }
`;

const cardSx = {
  // 1 × theme.shape.borderRadius (12px) — a clean rectangular card with
  // modest corner rounding. The previous 3× (36px) read as an oversized,
  // pill/capsule-like curve on the shorter cards instead of a normal card.
  borderRadius: 1,
  border: '1px solid #E9E7E3',
  boxShadow: '0 1px 2px rgba(28,25,23,.05), 0 1px 4px rgba(28,25,23,.04)',
  transition: 'box-shadow .15s, transform .15s',
  '&:hover': { boxShadow: '0 1px 2px rgba(28,25,23,.04), 0 8px 24px -8px rgba(28,25,23,.10)', transform: 'translateY(-1px)' },
};
export default function DashboardWidgets({ refreshToken = 0, onView, viewBusyRef = '' }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Every bucket starts collapsed — no auto-opened first row.
  const [openStatus, setOpenStatus] = useState(null);
  const [openComment, setOpenComment] = useState(null);
  const [openOrderStatus, setOpenOrderStatus] = useState(null);
  const [openOrderComment, setOpenOrderComment] = useState(false);
  const [openOrderIssue, setOpenOrderIssue] = useState(false);
  const [openDiscount, setOpenDiscount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    orderService
      // 20 (the API's max) so an expanded bucket has enough rows to scroll
      // through — not just the 5 that fit before scrolling was added.
      .dashboard(20)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load the dashboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  if (error) {
    return (
      <Alert severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
        {error}
      </Alert>
    );
  }

  if (loading && !summary) return <DashboardSkeleton />;
  if (!summary) return null;

  const totalOrders = summary.totalOrders || 0;
  const pct = (n) => (totalOrders > 0 ? Math.round((n / totalOrders) * 1000) / 10 : 0);
  const fmt = (n) => Number(n || 0).toLocaleString();
  const orderStatusBuckets = summary.orderStatuses || [];
  const discountBuckets = summary.discountBuckets || [];
  const hasCrossedDates = (summary.next7CrossedDeliveryDates || []).length > 0;

  return (
    <Box className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {/* ═══ Row 2 — Total Orders | Total/Unique Items | Delivery Date ═══ */}
      {/* Jumps straight from 1 column to 3 (no md:2-col step): with exactly
          3 cards, a 2-column breakpoint always strands the third card alone
          in its own row with empty space beside it. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-stretch">
        {/* Total Orders + Email/Kumkum split */}
        <Card variant="outlined" sx={{ ...cardSx, height: '100%' }}>
          <CardContent sx={{ '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <IconBadge icon={ListAltRoundedIcon} tone="primary" />
                <Box>
                  <StatLabel>Total Orders</StatLabel>
                  <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                    {fmt(totalOrders)}
                  </Typography>
                </Box>
              </Box>
              <ViewAllButton to="/dashboard/orders?type=allOrders&value=all" />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <SourcePill
                icon={<EmailRoundedIcon sx={{ fontSize: 14 }} />}
                bg="#2F4FA2"
                label="Orders - Email"
                count={summary.channelCounts?.['Orders - Email'] ?? 0}
                to="/dashboard/orders?type=channel&value=Orders%20-%20Email"
              />
              <SourcePill
                letter="M"
                bg="#D92D20"
                label="Manual Orders"
                count={summary.channelCounts?.['Order - Kumkum'] ?? 0}
                to="/dashboard/orders?type=channel&value=Order%20-%20Kumkum"
              />
            </Box>
          </CardContent>
        </Card>

        {/* Total / Unique Items — this card's own content (two short stats)
            is inherently shorter and narrower than its neighbors', so
            top/left-anchoring it (tried previously) left dead space
            pinned to the bottom-right. Centering both axes turns that same
            leftover space into even, intentional-looking margins instead —
            the card itself is untouched, still stretched to the row's
            shared height by the grid's items-stretch. */}
        <Card variant="outlined" sx={{ ...cardSx, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <CardContent sx={{ flex: 1, display: 'flex', alignItems: 'center', '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 2.5, width: '100%' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <IconBadge icon={ShoppingBagRoundedIcon} tone="primary" sx={{ mb: 1.5 }} />
                <StatLabel>Total Items</StatLabel>
                <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em', mb: 0.5 }}>
                  {fmt(summary.totalItems)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  Across all orders
                </Typography>
              </Box>
              <Box sx={{ bgcolor: '#E9E7E3' }} />
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <IconBadge icon={Inventory2RoundedIcon} tone="success" sx={{ mb: 1.5 }} />
                <StatLabel>Unique Items</StatLabel>
                <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em', mb: 0.5 }}>
                  {fmt(summary.uniqueItems)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  Distinct items ordered
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Order Delivery Date */}
        <Card variant="outlined" sx={{ ...cardSx, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', '&:last-child': { pb: 2 } }}>
            <StatLabel icon={EventRoundedIcon}>Order Delivery Date</StatLabel>
            {(summary.next7DeliveryDates || []).length === 0 ? (
              // flex:1 + centered: the label stays anchored top (matching
              // every other card's header), only the empty-state message
              // centers in the leftover height instead of sitting right
              // under the label with a blank gap below it.
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <EmptyState
                  icon={EventBusyRoundedIcon}
                  title="No deliveries in the next 7 days"
                  sub="Delivery dates will appear here when orders are scheduled."
                />
              </Box>
            ) : (
              <>
                {/* Fixed-height, internally-scrolling list (V5.5) — the card
                    itself always stays the same size (matches its Row 2
                    neighbors, which stretch to it via items-stretch) no
                    matter how many of the up-to-7 dates exist: 1 date or 7,
                    the card height never changes, only whether this inner
                    box needs to scroll. Days with no orders are already
                    excluded server-side, so every row here has at least one
                    order. */}
                <Box sx={{ maxHeight: DELIVERY_LIST_MAX_HEIGHT, overflowY: 'auto' }}>
                  {summary.next7DeliveryDates.map((d, i) => (
                    <Box key={d.date}>
                      {i > 0 && <Divider />}
                      <Box
                        component={Link}
                        to={`/dashboard/orders?type=deliveryDate&value=${encodeURIComponent(d.date)}`}
                        sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          py: 0.75, textDecoration: 'none', color: 'inherit',
                          '&:hover .dd-date': { color: 'primary.main' },
                        }}
                      >
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.15 }}>
                          <Typography className="dd-date" variant="body2" sx={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, transition: 'color .12s' }}>
                            {formatDisplayDate(d.date)}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>
                            {formatDaysUntil(d.daysUntil)}
                          </Typography>
                        </Box>
                        <Chip size="small" label={`${d.count} order${d.count === 1 ? '' : 's'}`} sx={{ bgcolor: '#FAFAF8', border: '1px solid #D9D6D1', fontSize: 10.5 }} />
                      </Box>
                    </Box>
                  ))}
                </Box>
                <ViewAllLink to="/dashboard/delivery-dates" />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Row 3 — Order | Item | Crossed Delivery Dates ═══ */}
      {/* Natural (unstretched) heights, top-aligned: these three cards hold
          very different amounts of content (five bucket rows, five bucket
          rows, up to 7 delivery-date rows). Forcing them to a shared
          stretched height (tried first) just relocated the mismatch inside
          the shorter cards as dead whitespace, which read worse than the
          cards simply being different heights — a normal, expected pattern
          in a card/bento layout. Same 1→3 column jump as Row 2 (3 cards,
          no good 2-column split). */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-start">
        {/* Order — Status + Comment (same list-of-buckets pattern as the
            Item card alongside it, instead of the donut chart this used to
            be — requested so the two cards read as one consistent family). */}
        <Card variant="outlined" sx={cardSx}>
          <SectionHead>Order</SectionHead>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <BucketGroup title="Status">
              {orderStatusBuckets.map((bucket) => (
                <BucketRow
                  key={bucket.value}
                  type="orderStatus"
                  bucket={bucket}
                  meta={{ label: bucket.value, tone: osToneKey(bucket.value) }}
                  onView={onView}
                  viewBusyRef={viewBusyRef}
                  isOpen={openOrderStatus === bucket.value}
                  onToggle={() => setOpenOrderStatus((cur) => (cur === bucket.value ? null : bucket.value))}
                />
              ))}
            </BucketGroup>
            {summary.orderComments && (
              <BucketGroup title="Comment">
                <BucketRow
                  type="orderComment"
                  bucket={summary.orderComments}
                  meta={{ label: 'Order Comments', tone: 'na' }}
                  onView={onView}
                  viewBusyRef={viewBusyRef}
                  isOpen={openOrderComment}
                  onToggle={() => setOpenOrderComment((cur) => !cur)}
                />
              </BucketGroup>
            )}
            {/* Half Released (V5.9) — orders holding at least one OS or
                Not Found product, counted ONCE per order however many
                flagged lines it has (and once, not twice, when it has both
                kinds). Deliberately different from the Item card's OS /
                Not Found rows alongside it, which count individual
                products; see HAS_ITEM_ISSUE_MATCH on the server. */}
            {summary.orderIssues && (
              <BucketGroup title="Issues">
                <BucketRow
                  type="orderIssue"
                  bucket={summary.orderIssues}
                  meta={{ label: 'Half Released', tone: 'os' }}
                  onView={onView}
                  viewBusyRef={viewBusyRef}
                  isOpen={openOrderIssue}
                  onToggle={() => setOpenOrderIssue((cur) => !cur)}
                />
              </BucketGroup>
            )}
          </CardContent>
        </Card>

        {/* Item — Item Status + Reason */}
        <Card variant="outlined" sx={cardSx}>
          <SectionHead>Item</SectionHead>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <BucketGroup title="Item Status">
              {summary.statuses.map((bucket) => (
                <BucketRow
                  key={bucket.value}
                  type="status"
                  bucket={{ ...bucket, total: summary.itemStatusCounts?.[bucket.value] ?? bucket.total }}
                  meta={deliveryMeta(bucket.value)}
                  onView={onView}
                  viewBusyRef={viewBusyRef}
                  isOpen={openStatus === bucket.value}
                  onToggle={() => setOpenStatus((cur) => (cur === bucket.value ? null : bucket.value))}
                />
              ))}
            </BucketGroup>
            <BucketGroup title="Reason">
              {summary.comments.map((bucket) => (
                <BucketRow
                  key={bucket.value}
                  type="comment"
                  bucket={{ ...bucket, total: summary.itemReasonCounts?.[bucket.value] ?? bucket.total }}
                  meta={commentMeta(bucket.value)}
                  onView={onView}
                  viewBusyRef={viewBusyRef}
                  isOpen={openComment === bucket.value}
                  onToggle={() => setOpenComment((cur) => (cur === bucket.value ? null : bucket.value))}
                />
              ))}
            </BucketGroup>
            {/* OS Pending by Item (new, additive) — per-item-number totals for
                the 'OS' Reason above, with per-order/customer breakdown on
                click. Its own page rather than another BucketRow: the report
                is grouped by item number, not by order, so it doesn't fit
                BucketRow's order-list shape. Given its own labeled section
                (like Item Status / Reason above it) with a prominent button
                rather than a plain link row, so it reads as its own
                destination, not just another bucket. */}
            <BucketGroup title="OS Pending by Item">
              <Box
                component={Link}
                to="/dashboard/os-pending"
                sx={{
                  position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                  py: 1.35, borderRadius: 1.5, bgcolor: 'primary.light', border: '1px solid', borderColor: 'primary.main',
                  color: 'primary.main', textDecoration: 'none', fontSize: 13, fontWeight: 700,
                  overflow: 'hidden', zIndex: 1,
                  // Resting state is the light/outlined tint (not the solid
                  // fill) so the hover sweep has somewhere to sweep FROM —
                  // primary.main vs primary.dark were too close in tone for
                  // the circles to read against a solid primary.main button.
                  //
                  // The text/icon color transition lives INSIDE '&:hover' (not
                  // on the base rule) so it only applies going INTO hover —
                  // CSS transitions use the target state's own transition
                  // timing. Delay (0.4s) + duration (0.35s) line up with the
                  // circles' own growth phase (the 50%→100% half of the 0.8s
                  // keyframes, where they actually expand over the text)
                  // instead of flipping white the instant the circles are
                  // still small and haven't covered anything yet.
                  '&:hover': { color: 'primary.contrastText', transition: 'color 0.35s ease 0.4s' },
                  // Two circles pinned just off the left/right edges, ready
                  // to grow inward on hover (see collisionLeft/Right above).
                  // z-index: -1 needs the button's own zIndex:1 above to
                  // form a stacking context — otherwise the circles would
                  // stack against a distant ancestor instead of this button
                  // and could paint behind neighboring cards.
                  '&::before, &::after': {
                    content: '""', position: 'absolute', top: '50%',
                    width: 20, height: 20, borderRadius: '50%',
                    bgcolor: 'primary.main', zIndex: -1,
                  },
                  '&::before': { left: -20, transform: 'translate(-50%, -50%)' },
                  '&::after': { right: -20, transform: 'translate(50%, -50%)' },
                  '&:hover::before': { animation: `${collisionLeft} 0.8s both alternate` },
                  '&:hover::after': { animation: `${collisionRight} 0.8s both alternate` },
                }}
              >
                <Inventory2RoundedIcon sx={{ fontSize: 17 }} />
                Click Here
                <ChevronRightRoundedIcon sx={{ fontSize: 17 }} />
              </Box>
            </BucketGroup>
          </CardContent>
        </Card>

        {/* Crossed Delivery Dates (V5.3; alert styling V5.8) — the past-dates
            mirror of the Order Delivery Date card in Row 2: latest 7
            delivery dates that have already passed, most recent first, so a
            missed/overdue delivery is never more than one glance away.
            Alert styling is deliberately restrained to ONE signal — a red
            border + red header — rather than painting every line of text
            red: an earlier pass made the heading, date, "days ago" caption,
            and order-count chip all the same red, which read as visual
            noise with no label/value contrast. Now only the header carries
            the alert color; the data itself (date, days-ago, count) stays
            normal ink/muted text like every other card, so it's still
            legible at a glance. Styling only applies when there's actually
            something to flag — an empty card (nothing overdue) stays fully
            neutral rather than reading as a false alarm. */}
        <Card
          variant="outlined"
          sx={{
            ...cardSx, display: 'flex', flexDirection: 'column',
            ...(hasCrossedDates && { borderColor: RED.border }),
          }}
        >
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', '&:last-child': { pb: 2 } }}>
            <StatLabel icon={HistoryRoundedIcon} color={hasCrossedDates ? RED.strong : 'text.disabled'}>
              Crossed Delivery Dates
            </StatLabel>
            {!hasCrossedDates ? (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <EmptyState
                  icon={EventBusyRoundedIcon}
                  title="No crossed delivery dates"
                  sub="Past delivery dates will appear here once an order's date has passed."
                />
              </Box>
            ) : (
              <>
                {/* Same fixed-height, internally-scrolling list as the Order
                    Delivery Date card above (V5.5) — card size stays
                    constant as more crossed dates accumulate over time. */}
                <Box sx={{ maxHeight: DELIVERY_LIST_MAX_HEIGHT, overflowY: 'auto' }}>
                  {summary.next7CrossedDeliveryDates.map((d, i) => (
                    <Box key={d.date}>
                      {i > 0 && <Divider />}
                      <Box
                        component={Link}
                        to={`/dashboard/orders?type=deliveryDate&value=${encodeURIComponent(d.date)}`}
                        sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          py: 0.75, textDecoration: 'none', color: 'inherit',
                          '&:hover .dd-date': { color: 'primary.main' },
                        }}
                      >
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.15 }}>
                          <Typography className="dd-date" variant="body2" sx={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, transition: 'color .12s' }}>
                            {formatDisplayDate(d.date)}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>
                            {formatDaysUntil(d.daysUntil)}
                          </Typography>
                        </Box>
                        <Chip size="small" label={`${d.count} order${d.count === 1 ? '' : 's'}`} sx={{ bgcolor: '#FAFAF8', border: '1px solid #D9D6D1', fontSize: 10.5 }} />
                      </Box>
                    </Box>
                  ))}
                </Box>
                <ViewAllLink to="/dashboard/delivery-dates" />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Row 3.5 — Discount (portrait, V5.4) | Today's Orders ═══ */}
      {/* Discount switched from its old full-width landscape row layout to
          the vertical BucketGroup stack so it no longer needs the full row
          width — freeing up the space beside it for Today's Orders (moved
          down from Row 3 to make room for Crossed Delivery Dates above).
          items-start (not stretch): the two cards hold very different
          amounts of content, same reasoning as Row 3 above. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-start">
        <Card variant="outlined" sx={cardSx}>
          <SectionHead>Discount</SectionHead>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <BucketGroup title="Discount Type" layout="row">
              {discountBuckets.map((bucket) => (
                <BucketRow
                  key={bucket.value}
                  type="discount"
                  bucket={bucket}
                  meta={discountBucketMeta(bucket.value)}
                  onView={onView}
                  viewBusyRef={viewBusyRef}
                  isOpen={openDiscount === bucket.value}
                  onToggle={() => setOpenDiscount((cur) => (cur === bucket.value ? null : bucket.value))}
                />
              ))}
            </BucketGroup>
          </CardContent>
        </Card>

        {/* Today's Orders */}
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ pb: '8px !important' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ flexShrink: 0 }}>
                <StatLabel icon={TodayRoundedIcon}>Today&rsquo;s Orders</StatLabel>
                <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {summary.todayOrders}
                </Typography>
              </Box>
              <Sparkline data={summary.last7Days || []} />
              <ViewAllButton to="/dashboard/orders?type=today&value=today" />
            </Box>
          </CardContent>
          <Divider />
          <Box>
            {/* Object.keys, not PROCESSED_BY_USERS — dynamic: the server
                seeds the known staff at 0 but also includes any other real
                processed_by value (e.g. 'Dev Team'), so whoever actually
                processed an order shows up here too, not just the fixed list. */}
            {Object.keys(summary.todayByProcessor || {}).filter((u) => (summary.todayByProcessor?.[u] ?? 0) > 0).map((user, i) => (
              <Box key={user}>
                {i > 0 && <Divider />}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 2.25, py: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>{user}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{summary.todayByProcessor[user]}</Typography>
                </Box>
              </Box>
            ))}
            {Object.keys(summary.todayByProcessor || {}).every((u) => (summary.todayByProcessor?.[u] ?? 0) === 0) && (
              <EmptyState icon={InboxRoundedIcon} title="No orders processed today" compact />
            )}
          </Box>
        </Card>
      </div>

      {/* ═══ Row 3.7 — Order Status stat cards (moved above Team Performance) ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {orderStatusBuckets.map((bucket) => {
          const tone = TONE[osToneKey(bucket.value)];
          const Icon = osIconFor(bucket.value);
          return (
            <Card key={bucket.value} variant="outlined" sx={{ ...cardSx, height: '100%' }}>
              <CardContent sx={{ height: '100%', display: 'flex', gap: 1.5, alignItems: 'center', '&:last-child': { pb: 2 } }}>
                <Avatar sx={{ bgcolor: tone.main, width: 40, height: 40, flexShrink: 0 }}>
                  <Icon sx={{ fontSize: 20 }} />
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="overline" sx={{ lineHeight: 1.3, color: 'text.secondary', fontWeight: 700, fontSize: 10.5 }}>
                    {bucket.value}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    {bucket.total}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    {pct(bucket.total)}% of total orders
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ═══ Row 3.8 — Recent Activity, full width (Order Activity Log) ═══ */}
      <div className="mb-4">
        <RecentActivityCard refreshToken={refreshToken} onView={onView} viewBusyRef={viewBusyRef} />
      </div>

      {/* ═══ Row 4 — Team Performance, full width ═══ */}
      <Card variant="outlined" sx={cardSx}>
        <SectionHead icon={GroupsRoundedIcon} sub="Orders processed by team members">
          Team Performance
        </SectionHead>
        <TableContainer>
          {/* width:100% stretches the table to the card's full width instead
              of shrink-wrapping to content and leaving a large blank strip
              on a full-width card. Deliberately NOT tableLayout:'fixed' —
              that divides all 7 columns dead-equal, which starves the
              "Employee"/"Orders Processed" label column and wraps it;
              auto layout still fills 100% but sizes each column off its
              own content first. minWidth keeps columns from crushing on
              narrow screens, where TableContainer's overflow-x scrolls. */}
          <Table size="small" sx={{ minWidth: 640, width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.03em', bgcolor: '#FAFAF8', py: 1.5, whiteSpace: 'nowrap' }}>
                  Employee
                </TableCell>
                {/* Object.keys, not PROCESSED_BY_USERS — dynamic, see the
                    Today's Orders processor list above for why. */}
                {Object.keys(summary.allByProcessor || {}).map((user) => (
                  <TableCell key={user} align="center" sx={{ bgcolor: '#FAFAF8', py: 1.5 }}>
                    <Box
                      component={Link}
                      to={`/dashboard/orders?type=processor&value=${encodeURIComponent(user)}`}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, textDecoration: 'none',
                        color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.03em',
                        '&:hover': { color: 'primary.main' },
                      }}
                    >
                      <Avatar sx={{ width: 18, height: 18, bgcolor: 'transparent', color: 'text.disabled', border: '1px solid #D9D6D1' }}>
                        <Typography sx={{ fontSize: 9, fontWeight: 700 }}>{user.charAt(0)}</Typography>
                      </Avatar>
                      {user}
                    </Box>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow sx={{ '&:last-child td': { borderBottom: 0 } }}>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary', py: 1.75, whiteSpace: 'nowrap' }}>Orders Processed</TableCell>
                {Object.keys(summary.allByProcessor || {}).map((user) => (
                  <TableCell key={user} align="center" sx={{ fontFamily: 'Schibsted Grotesk, sans-serif', fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums', py: 1.75 }}>
                    {summary.allByProcessor?.[user] ?? 0}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}

// ── Small building blocks ──────────────────────────────────────────────

// `color` (optional) overrides the default muted text.disabled tone — used
// by the Crossed Delivery Dates card to turn its own header red when it has
// overdue dates to flag (V5.7).
function StatLabel({ icon: Icon, children, color = 'text.disabled' }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
      {Icon && <Icon sx={{ fontSize: 14, color }} />}
      <Typography variant="overline" sx={{ lineHeight: 1, color, fontWeight: 700, fontSize: 10.5 }}>
        {children}
      </Typography>
    </Box>
  );
}

// Rounded-square colored icon badge (Total Orders / Total Items / Unique
// Items headers) — a bigger, more deliberate icon treatment than the small
// inline StatLabel icon, used where a stat needs to visually anchor a card.
const ICON_BADGE_TONES = {
  primary: { bg: '#EDF2FA', color: '#2F4FA2' },
  success: { bg: '#ECFDF3', color: '#059669' },
};
function IconBadge({ icon: Icon, tone = 'primary', size = 44, sx }) {
  const palette = ICON_BADGE_TONES[tone] || ICON_BADGE_TONES.primary;
  return (
    <Box
      sx={{
        width: size, height: size, borderRadius: 1.5, flexShrink: 0,
        bgcolor: palette.bg, color: palette.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...sx,
      }}
    >
      <Icon sx={{ fontSize: size * 0.5 }} />
    </Box>
  );
}

function SectionHead({ children, icon: Icon, sub }) {
  return (
    <Box sx={{ px: 2.25, py: 1.75, borderBottom: '1px solid #E9E7E3', bgcolor: '#FAFAF8' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {Icon && <Icon sx={{ fontSize: 18, color: 'text.secondary' }} />}
        <Typography variant="subtitle1" sx={{ fontFamily: 'Schibsted Grotesk, sans-serif', fontWeight: 700, letterSpacing: '-0.01em' }}>
          {children}
        </Typography>
      </Box>
      {sub && <Typography variant="caption" sx={{ color: 'text.disabled' }}>{sub}</Typography>}
    </Box>
  );
}

function ViewAllButton({ to }) {
  return (
    <Box
      component={Link}
      to={to}
      className="whitespace-nowrap"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.25, flexShrink: 0,
        border: '1px solid #C5D2EC', borderRadius: 1.5, px: 1.75, py: 0.6,
        fontSize: 11.5, fontWeight: 700, color: 'primary.main', bgcolor: '#EDF2FA', textDecoration: 'none',
        transition: 'background .15s, color .15s',
        '&:hover': { bgcolor: '#E0E9F8', color: 'primary.dark' },
      }}
    >
      View All
      <ChevronRightRoundedIcon sx={{ fontSize: 15 }} />
    </Box>
  );
}

function ViewAllLink({ to }) {
  return (
    <Box
      component={Link}
      to={to}
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
        mt: 1.25, py: 1, borderTop: '1px solid #E9E7E3', mx: -2.25, mb: -2.25, px: 2.25,
        bgcolor: '#FAFAF8', color: 'primary.main', textDecoration: 'none',
        fontSize: 12, fontWeight: 600, transition: 'background .15s',
        '&:hover': { bgcolor: '#EDF2FA' },
      }}
    >
      View All
      <ChevronRightRoundedIcon sx={{ fontSize: 15 }} />
    </Box>
  );
}

// `to` (optional) makes the whole pill a link to that bucket's "View All"
// page (e.g. the Email/Kumkum channel split) — same click-through pattern
// every other dashboard bucket already uses. Omitting `to` keeps a plain,
// non-interactive pill for any future non-clickable use.
function SourcePill({ icon, letter, bg, label, count, to }) {
  const content = (
    <>
      <Avatar sx={{ width: 30, height: 30, bgcolor: bg, fontSize: 13, fontWeight: 700 }}>
        {icon || letter}
      </Avatar>
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 600, color: 'text.secondary' }}>
        {label}
      </Typography>
      <Divider orientation="vertical" flexItem sx={{ my: 0.25 }} />
      <Typography sx={{ fontFamily: 'Schibsted Grotesk, sans-serif', fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
        {count}
      </Typography>
      {to && <ChevronRightRoundedIcon sx={{ fontSize: 17, color: 'text.disabled', flexShrink: 0 }} />}
    </>
  );
  const baseSx = { display: 'flex', alignItems: 'center', gap: 1.5, px: 1.75, py: 1.5, borderRadius: 1.5, bgcolor: '#FAFAF8', border: '1px solid #E9E7E3', minWidth: 0 };
  if (!to) return <Box sx={baseSx}>{content}</Box>;
  return (
    <Box
      component={Link}
      to={to}
      sx={{ ...baseSx, textDecoration: 'none', color: 'inherit', cursor: 'pointer', transition: 'background .15s, border-color .15s', '&:hover': { bgcolor: '#EDF2FA', borderColor: '#C9D6EE' } }}
    >
      {content}
    </Box>
  );
}

function EmptyState({ icon: Icon, title, sub, compact }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, py: compact ? 2 : 3.5, color: 'text.disabled', textAlign: 'center' }}>
      <Icon sx={{ fontSize: 26, opacity: 0.6 }} />
      <Typography variant="body2" sx={{ color: 'text.disabled' }}>{title}</Typography>
      {sub && <Typography variant="caption" sx={{ color: 'text.disabled' }}>{sub}</Typography>}
    </Box>
  );
}

// `layout="row"` (opt-in, used only by the Discount section) lays the
// bucket rows out in a 2-across grid instead of the default vertical stack
// every other BucketGroup (Order/Item) still uses unchanged. Capped at 2
// columns (not 4) because the Discount card itself only spans about half
// the row's width (V5.4, paired with Today's Orders) — a breakpoint-driven
// 4-across would go by viewport width, not the card's actual (narrower)
// rendered width, and end up cramped. `alignItems:'start'` keeps each
// pill's own height independent, so expanding one bucket only grows its own
// cell rather than stretching its row-mates to match.
function BucketGroup({ title, children, layout = 'column' }) {
  return (
    <Box>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700, fontSize: 10.5, display: 'block', mb: 1 }}>
        {title}
      </Typography>
      <Box
        sx={
          layout === 'row'
            ? {
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                gap: 1,
                alignItems: 'start',
              }
            : { display: 'flex', flexDirection: 'column', gap: 1 }
        }
      >
        {children}
      </Box>
    </Box>
  );
}

// Sparkline — pure SVG, real last-7-days data from the API.
function Sparkline({ data }) {
  const width = 96;
  const height = 34;
  const counts = data.length ? data.map((d) => d.count) : [0];
  const max = Math.max(1, ...counts);
  const points = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * width : width / 2;
    const y = height - 4 - (d.count / max) * (height - 8);
    return [x, y];
  });
  const path = points.map((p) => p.join(',')).join(' ');
  const last = points[points.length - 1];

  return (
    <Box component="svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" sx={{ flex: 1, minWidth: 0, height: 34 }}>
      <polyline points={path} fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill="#059669" />}
    </Box>
  );
}

// One collapsible bucket row (Item Status / Reason) — a tone-tinted header
// that expands to the latest matching orders + a View All link. Collapsed
// by default; only one open per group (openStatus/openComment above).
//
// The dashboard summary only ships a small preview (bucket.orders, capped
// at 20) — fetching every order in a 400+ order bucket up front on every
// dashboard load would be wasteful. Instead, the FIRST time this row is
// expanded it fetches the real paginated list (same endpoint the "View All"
// page uses) and keeps fetching more pages as the user scrolls near the
// bottom, so the scrollbar keeps giving you more orders until the bucket is
// exhausted — not just the initial preview.
const BUCKET_PAGE_SIZE = 50;
function BucketRow({ type, bucket, meta, onView, viewBusyRef, isOpen, onToggle }) {
  const label = meta?.label || bucket.value;
  const toneKey = meta?.tone && TONE[meta.tone] ? meta.tone : 'na';
  const tone = TONE[toneKey];
  const q = `?type=${encodeURIComponent(type)}&value=${encodeURIComponent(bucket.value)}`;

  const [orders, setOrders] = useState(bucket.orders || []);
  const [nextPage, setNextPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const startedRef = useRef(false);

  const loadPage = useCallback(
    async (page) => {
      setLoadingMore(true);
      try {
        const res = await orderService.dashboardOrders({ type, value: bucket.value, page, limit: BUCKET_PAGE_SIZE });
        setOrders((prev) => (page === 1 ? res.data : [...prev, ...res.data]));
        setNextPage(page + 1);
        setHasMore(page < (res.meta?.pages || 1));
      } catch {
        // Keep whatever was already loaded (the dashboard summary's preview,
        // or earlier pages) — a failed "load more" shouldn't blank the list.
        setHasMore(false);
      } finally {
        setLoadingMore(false);
      }
    },
    [type, bucket.value]
  );

  // Kick off the real paginated fetch the first time this row opens —
  // replaces the small preview with the full, scrollable list.
  useEffect(() => {
    if (isOpen && !startedRef.current) {
      startedRef.current = true;
      loadPage(1);
    }
  }, [isOpen, loadPage]);

  const onListScroll = (e) => {
    if (loadingMore || !hasMore) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      loadPage(nextPage);
    }
  };

  return (
    // borderRadius:1 (12px) — a rounded rectangle, not the stadium/capsule
    // shape a larger radius produces on a ~40px-tall row.
    <Box sx={{ borderRadius: 1, border: `1px solid ${tone.border}`, overflow: 'hidden' }}>
      <Box
        component="button"
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        sx={{
          all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
          bgcolor: tone.soft,
        }}
      >
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: tone.main, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ flex: 1, fontWeight: 700, color: tone.strong }}>
          {label}
        </Typography>
        <Chip size="small" label={bucket.total} sx={{ bgcolor: '#fff', border: '1px solid #D9D6D1', fontWeight: 700, height: 20 }} />
        <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: 'text.disabled', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </Box>

      {isOpen && (
        <Box sx={{ borderTop: `1px solid ${tone.border}` }}>
          {orders.length === 0 ? (
            <EmptyState icon={InboxRoundedIcon} title="No orders in this section yet" compact />
          ) : (
            // Capped height + scroll, loading more pages as the user nears
            // the bottom — the scrollbar keeps surfacing orders until the
            // whole bucket has been loaded, not just an initial preview.
            // "View All" (kept below, unchanged) still opens the dedicated
            // full-page list if that's preferred.
            <Box sx={{ maxHeight: 260, overflowY: 'auto' }} onScroll={onListScroll}>
              {orders.map((o, i) => (
                <Box key={o.id}>
                  {i > 0 && <Divider />}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="caption" sx={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                          #{o.portalOrderRef}
                        </Typography>
                        <Tooltip title={o.customerName || 'No customer'}>
                          <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                            {o.customerName || 'No customer'}
                          </Typography>
                        </Tooltip>
                        <Typography variant="caption" sx={{ color: 'text.disabled', ml: 'auto', flexShrink: 0 }}>
                          {o.orderDate || '—'}
                        </Typography>
                      </Box>
                      {type === 'orderComment' && o.orderComment && (
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={o.orderComment}>
                          {o.orderComment}
                        </Typography>
                      )}
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        {o.processedBy ? (
                          <>Processed by <b style={{ color: 'inherit' }}>{o.processedBy}</b></>
                        ) : (
                          <em>Not assigned</em>
                        )}
                      </Typography>
                    </Box>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => onView(o.portalOrderRef)}
                      disabled={viewBusyRef === o.portalOrderRef}
                      sx={{
                        border: '1px solid #D9D6D1', borderRadius: 1.5, bgcolor: '#fff',
                        px: 1.5, py: 0.5, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                        color: 'text.secondary',
                        '&:hover': { borderColor: 'primary.main', color: 'primary.main', bgcolor: 'primary.light' },
                        '&:disabled': { color: 'text.disabled', cursor: 'not-allowed' },
                      }}
                    >
                      {viewBusyRef === o.portalOrderRef ? '…' : 'View'}
                    </Box>
                  </Box>
                </Box>
              ))}
              {loadingMore && (
                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.disabled', py: 1 }}>
                  Loading more…
                </Typography>
              )}
            </Box>
          )}
          <ViewAllLinkFlat to={`/dashboard/orders${q}`} />
        </Box>
      )}
    </Box>
  );
}

function ViewAllLinkFlat({ to }) {
  return (
    <Box
      component={Link}
      to={to}
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
        py: 0.9, borderTop: '1px solid #E9E7E3', bgcolor: '#FAFAF8',
        color: 'primary.main', textDecoration: 'none', fontSize: 12, fontWeight: 600,
        transition: 'background .15s', '&:hover': { bgcolor: '#EDF2FA' },
      }}
    >
      View All
      <ChevronRightRoundedIcon sx={{ fontSize: 15 }} />
    </Box>
  );
}

// Recent Activity — cross-order Order Activity Log feed (who changed what,
// when, on any order). Deliberately fetched independently of the main
// dashboard summary (its own endpoint, GET /v1/orders/logs/recent) rather
// than folded into it, so this card's data is always exactly as fresh as
// what it shows — no extra fields threaded through getDashboardSummary just
// for this one card. Refetches whenever `refreshToken` changes, same trigger
// every other widget already reacts to (any order edit saved from this
// page's View modal — see Dashboard.jsx's bump()).
const RECENT_ACTIVITY_PAGE_SIZE = 15;
function RecentActivityCard({ refreshToken, onView, viewBusyRef }) {
  const [entries, setEntries] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [nextPage, setNextPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Same infinite-scroll shape as BucketRow below: page 1 loads on mount/
  // refreshToken change, replacing the list; later pages append. Never a
  // fixed cap — the reader can keep scrolling through the whole log.
  const loadPage = useCallback(async (page) => {
    setLoadingMore(true);
    setError('');
    try {
      const res = await orderService.recentActivity({ page, limit: RECENT_ACTIVITY_PAGE_SIZE });
      setEntries((prev) => {
        if (page === 1) return res.data;
        // Skip/limit paging can drift if new entries are written between
        // page fetches (a real order edit landing while someone's mid-
        // scroll) — an offset that was valid a moment ago can re-surface an
        // already-seen row. De-dupe by id so that never renders as a
        // repeated row (and a repeated React key).
        const seen = new Set((prev || []).map((e) => e.id));
        return [...(prev || []), ...res.data.filter((e) => !seen.has(e.id))];
      });
      setNextPage(page + 1);
      setHasMore(page < (res.meta?.pages || 1));
    } catch (e) {
      if (page === 1) setError(e.message || 'Could not load recent activity.');
      else setHasMore(false); // keep whatever already loaded; just stop paging
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadPage is stable; refreshToken is the real trigger
  }, [refreshToken]);

  const onListScroll = (e) => {
    if (loadingMore || !hasMore) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      loadPage(nextPage);
    }
  };

  const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  return (
    <Card variant="outlined" sx={cardSx}>
      <SectionHead icon={UpdateRoundedIcon} sub="Latest changes across every order">
        Recent Activity
      </SectionHead>
      {error ? (
        <CardContent>
          <Alert severity="error" variant="outlined">{error}</Alert>
        </CardContent>
      ) : entries === null ? (
        <CardContent>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={28} sx={{ my: 0.5 }} />
          ))}
        </CardContent>
      ) : entries.length === 0 ? (
        <EmptyState icon={InboxRoundedIcon} title="No activity recorded yet" compact />
      ) : (
        // maxHeight ≈ 4 rows (each ~58px with its padding) before scrolling
        // kicks in — mirrors BucketRow's own maxHeight:260 preview below.
        <Box sx={{ maxHeight: 240, overflowY: 'auto' }} onScroll={onListScroll}>
          {entries.map((entry, i) => (
            <Box key={entry.id}>
              {i > 0 && <Divider />}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.25, py: 1.1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'text.secondary' }}>
                      #{entry.portalOrderRef}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{entry.actor}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{entry.message}</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>{fmtWhen(entry.createdAt)}</Typography>
                </Box>
                <Box
                  component="button"
                  type="button"
                  onClick={() => onView(entry.portalOrderRef)}
                  disabled={viewBusyRef === entry.portalOrderRef}
                  sx={{
                    border: '1px solid #D9D6D1', borderRadius: 1.5, bgcolor: '#fff',
                    px: 1.5, py: 0.5, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                    color: 'text.secondary',
                    '&:hover': { borderColor: 'primary.main', color: 'primary.main', bgcolor: 'primary.light' },
                    '&:disabled': { color: 'text.disabled', cursor: 'not-allowed' },
                  }}
                >
                  {viewBusyRef === entry.portalOrderRef ? '…' : 'View'}
                </Box>
              </Box>
            </Box>
          ))}
          {loadingMore && (
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.disabled', py: 1 }}>
              Loading more…
            </Typography>
          )}
        </Box>
      )}
      {entries && entries.length > 0 && <ViewAllLinkFlat to="/dashboard/activity" />}
    </Card>
  );
}

// Polished skeleton loading state — mirrors the real layout's row structure
// so the page doesn't "jump" once data arrives.
function DashboardSkeleton() {
  return (
    <Box>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} variant="outlined" sx={cardSx}>
            <CardContent sx={{ display: 'flex', gap: 1.5 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="70%" height={14} />
                <Skeleton width="40%" height={30} />
                <Skeleton width="55%" height={12} />
              </Box>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} variant="outlined" sx={cardSx}>
            <CardContent>
              <Skeleton width="50%" height={16} />
              <Skeleton width="35%" height={34} sx={{ mb: 1 }} />
              <Skeleton variant="rounded" height={44} />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} variant="outlined" sx={cardSx}>
            <CardContent>
              <Skeleton width="60%" height={20} sx={{ mb: 1.5 }} />
              <Skeleton variant="rounded" height={100} />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card variant="outlined" sx={cardSx}>
        <CardContent>
          <Skeleton width="30%" height={20} sx={{ mb: 1.5 }} />
          <Skeleton variant="rounded" height={80} />
        </CardContent>
      </Card>
    </Box>
  );
}
