const CHANNEL_ID = -1004230290296;
const REQUIRED_INVITES = 3;

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Bot is running ✅");
    }

    const update = await request.json();

    try {
      if (update.message) {
        await handleMessage(update.message, env);
      } else if (update.chat_member) {
        await handleChatMember(update.chat_member, env);
      }
    } catch (err) {
      console.log("Error:", err);
    }

    return new Response("OK");
  },
};

async function tg(method, env, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const userId = message.from.id;

  if (env.ADMIN_ID && String(userId) === String(env.ADMIN_ID) && message.document) {
    await env.KV.put("reward_file_id", message.document.file_id);
    await tg("sendMessage", env, {
      chat_id: chatId,
      text: "فایل جایزه ذخیره شد ✅",
    });
    return;
  }

  if (message.text === "/start") {
    let link = await env.KV.get(`link:${userId}`);

    if (!link) {
      const result = await tg("createChatInviteLink", env, {
        chat_id: CHANNEL_ID,
        name: `ref_${userId}`,
      });

      if (!result.ok) {
        await tg("sendMessage", env, {
          chat_id: chatId,
          text: "خطا در ساخت لینک دعوت. لطفاً بعداً دوباره امتحان کن.",
        });
        return;
      }

      link = result.result.invite_link;
      await env.KV.put(`link:${userId}`, link);
      await env.KV.put(`owner:${link}`, String(userId));
      await env.KV.put(`count:${userId}`, "0");
    }

    const count = (await env.KV.get(`count:${userId}`)) || "0";

    await tg("sendMessage", env, {
      chat_id: chatId,
      text: `سلام 👋\nاین لینک اختصاصی توئه، به دوستات بفرست:\n${link}\n\nهر وقت ۳ نفر با این لینک عضو چنل بشن، فایل جایزه خودکار برات ارسال می‌شه.\n\nتعداد دعوت‌های موفق فعلی: ${count} از ${REQUIRED_INVITES}`,
    });
  }
}

async function handleChatMember(chatMember, env) {
  if (chatMember.chat.id !== CHANNEL_ID) return;

  const oldStatus = chatMember.old_chat_member.status;
  const newStatus = chatMember.new_chat_member.status;

  const joined = (oldStatus === "left" || oldStatus === "kicked") && newStatus === "member";
  if (!joined) return;

  const inviteLink = chatMember.invite_link;
  if (!inviteLink) return;

  const link = inviteLink.invite_link;
  const ownerId = await env.KV.get(`owner:${link}`);
  if (!ownerId) return;

  const countStr = (await env.KV.get(`count:${ownerId}`)) || "0";
  const newCount = parseInt(countStr, 10) + 1;
  await env.KV.put(`count:${ownerId}`, String(newCount));

  if (newCount >= REQUIRED_INVITES) {
    const alreadyRewarded = await env.KV.get(`rewarded:${ownerId}`);
    if (!alreadyRewarded) {
      const fileId = await env.KV.get("reward_file_id");
      if (fileId) {
        await tg("sendDocument", env, {
          chat_id: ownerId,
          document: fileId,
          caption: "تبریک! 🎉 این فایل جایزه توئه.",
        });
        await env.KV.put(`rewarded:${ownerId}`, "1");
      } else {
        await tg("sendMessage", env, {
          chat_id: ownerId,
          text: "تبریک، ۳ نفر رو دعوت کردی! فایل جایزه به‌زودی برات ارسال می‌شه.",
        });
      }
    }
  } else {
    await tg("sendMessage", env, {
      chat_id: ownerId,
      text: `یه نفر با لینک تو عضو شد ✅\nتعداد فعلی: ${newCount} از ${REQUIRED_INVITES}`,
    });
  }
}
