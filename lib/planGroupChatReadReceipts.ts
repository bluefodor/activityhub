export type PlanGroupChatReadReceipt = {
  readCount: number;
  total: number;
};

export type PlanGroupChatReadReceiptMember = {
  id: string;
  name: string;
};

export type PlanGroupChatReadReceiptDetails = PlanGroupChatReadReceipt & {
  read: PlanGroupChatReadReceiptMember[];
  unread: PlanGroupChatReadReceiptMember[];
};

function otherMemberIds(messageUserId: string, memberIds: string[]): string[] {
  return memberIds.filter((id) => id !== messageUserId);
}

function hasReadMessage(
  memberId: string,
  messageCreatedAt: string,
  readsByUserId: ReadonlyMap<string, string>
): boolean {
  const lastRead = readsByUserId.get(memberId);
  return !!lastRead && new Date(lastRead).getTime() >= new Date(messageCreatedAt).getTime();
}

/** How many other plan members have read through this message (last_read_at >= created_at). */
export function getPlanGroupChatReadReceipt(
  message: { user_id: string; created_at: string },
  currentUserId: string,
  memberIds: string[],
  readsByUserId: ReadonlyMap<string, string>
): PlanGroupChatReadReceipt | null {
  if (message.user_id !== currentUserId) return null;

  const others = otherMemberIds(message.user_id, memberIds);
  if (others.length === 0) return null;

  const readCount = others.filter((id) =>
    hasReadMessage(id, message.created_at, readsByUserId)
  ).length;

  return { readCount, total: others.length };
}

export function getPlanGroupChatReadReceiptDetails(
  message: { user_id: string; created_at: string },
  currentUserId: string,
  memberIds: string[],
  readsByUserId: ReadonlyMap<string, string>,
  memberNamesById: ReadonlyMap<string, string>
): PlanGroupChatReadReceiptDetails | null {
  const summary = getPlanGroupChatReadReceipt(message, currentUserId, memberIds, readsByUserId);
  if (!summary) return null;

  const others = otherMemberIds(message.user_id, memberIds);
  const read: PlanGroupChatReadReceiptMember[] = [];
  const unread: PlanGroupChatReadReceiptMember[] = [];

  others.forEach((id) => {
    const member = { id, name: memberNamesById.get(id) || 'Member' };
    if (hasReadMessage(id, message.created_at, readsByUserId)) {
      read.push(member);
    } else {
      unread.push(member);
    }
  });

  read.sort((a, b) => a.name.localeCompare(b.name));
  unread.sort((a, b) => a.name.localeCompare(b.name));

  return { ...summary, read, unread };
}
