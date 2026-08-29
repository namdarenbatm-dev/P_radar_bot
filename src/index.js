const CHANNEL_ID = -1004230290296;
const CHANNEL_USERNAME = "paymentradar";
const REQUIRED_INVITES = 3;
const BOT_USERNAME = "P_radar_bot";

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

function progressBar(count) {
  let bar = "";
  for (let i = 0; i < REQUIRED_INVITES; i++) {
    bar += i < count ? "✅ " : "⬜️ ";
  }
  return bar.trim();
}

async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || "";

  if (env.ADMIN_ID && String(userId) === String(env.ADMIN_ID) && message.document) {
    await env.KV.put("reward_file_id", message.document.file_id);
    await tg("sendMessage", env, {
      chat_id: chatId,
      text: "فایل جایزه ذخیره شد ✅",
    });
    return;
  }

  if (text.startsWith("/start")) {
    const parts = text.split(" ");
    const payload = parts.length > 1 ? parts[1] : null;

    if (payload && payload !== String(userId)) {
      const alreadyReferred = await env.KV.get(`referred:${userId}`);
      if (!alreadyReferred) {
        await env.KV.put(`referred:${userId}`, "1");
        await env.KV.put(`pending:${userId}`, payload);
      }
    }

    const count = parseInt((await env.KV.get(`count:${userId}`)) || "0", 10);
    const myLink = `https://t.me/${BOT_USERNAME}?start=${userId}`;

    await tg("sendMessage", env, {
      chat_id: chatId,
      text: `سلام 👋

این لینک اختصاصی توئه، به دوستات بفرست:
${myLink}

هر وقت ۳ نفر با این لینک وارد ربات بشن و عضو چنل @${CHANNEL_USERNAME} بشن، فایل جایزه خودکار برات ارسال می‌شه.

📊 پیشرفت تو:
${progressBar(count)}
${count} از ${REQUIRED_INVITES} دعوت موفق

👈 حالا برو عضو چنل بشو: https://t.me/${CHANNEL_USERNAME}`,
    });
  }
}

async function handleChatMember(chatMember, env) {
  if (chatMember.chat.id !== CHANNEL_ID) return;

  const oldStatus = chatMember.old_chat_member.status;
  const newStatus = chatMember.new_chat_member.status;

  const joined = (oldStatus === "left" || oldStatus === "kicked") && newStatus === "member";
  if (!joined) return;

  const newUserId = chatMember.new_chat_member.user.id;

  const ownerId = await env.KV.get(`pending:${newUserId}`);
  if (!ownerId) return;

  await env.KV.delete(`pending:${newUserId}`);

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
          caption: `🎉 تبریک!

${progressBar(newCount)}
${newCount} از ${REQUIRED_INVITES} — کامل شد!

این فایل جایزه توئه 🎁`,
        });
        await env.KV.put(`rewarded:${ownerId}`, "1");
      } else {
        await tg("sendMessage", env, {
          chat_id: ownerId,
          text: `🎉 تبریک، ۳ نفر رو دعوت کردی!\n${progressBar(newCount)}\nفایل جایزه به‌زودی برات ارسال می‌شه.`,
        });
      }
    }
  } else {
    await tg("sendMessage", env, {
      chat_id: ownerId,
      text: `🎊 یه نفر با لینک تو عضو چنل شد!

📊 پیشرفت تو:
${progressBar(newCount)}
${newCount} از ${REQUIRED_INVITES} دعوت موفق`,
    });
  }
}
