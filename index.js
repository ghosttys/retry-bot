require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require("@discordjs/voice");
const ytdl = require("ytdl-core");
const OpenAI = require("openai");

// ===============================
// CREATE CLIENT
// ===============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ===============================
// OPENAI
// ===============================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
});

// ===============================
// MEMORY FOR XP / COINS
// ===============================
let xp = {};
let coins = {};

// ===============================
// BOT READY
// ===============================
client.on("ready", () => {
  console.log(`✅ Ghosttys bott Online: ${client.user.tag}`);
});

// ===============================
// MESSAGE HANDLER
// ===============================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const userId = message.author.id;

  // XP & Coins
  if (!xp[userId]) xp[userId] = 0;
  if (!coins[userId]) coins[userId] = 0;
  xp[userId]++;
  coins[userId]++;

  // AI REPLY WHEN MENTIONED
  if (message.mentions.has(client.user)) {
    try {
      await message.channel.sendTyping();
      const prompt = message.content.replace(`<@${client.user.id}>`, "").trim();
      if (!prompt) return;
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Ghosttys bott, a helpful Discord assistant." },
          { role: "user", content: prompt }
        ],
        max_tokens: 250
      });
      const reply = response.choices[0].message.content;
      message.reply(reply);
    } catch (err) {
      console.error(err);
      message.reply("❌ AI error");
    }
  }

  // COMMANDS
  if (!message.content.startsWith("!")) return;
  const args = message.content.slice(1).split(" ");
  const cmd = args.shift().toLowerCase();

  // HELP
  if (cmd === "help") {
    message.reply(`
📖 Ghosttys bott Commands:

AI: @Ghosttys bott <question>
!ping
!level
!balance
!kick @user
!ban @user
!mute @user
!shop
!buy vip / custom
!giveaway <minutes> <prize>
!join
!play <youtube link>
!stop
    `);
  }

  // PING
  if (cmd === "ping") message.reply(`🏓 Pong! ${client.ws.ping}ms`);

  // LEVELS
  if (cmd === "level") message.reply(`⭐ XP: ${xp[userId]}`);
  if (cmd === "balance") message.reply(`💰 Coins: ${coins[userId]}`);

  // MODERATION
  if (cmd === "kick") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply("❌ No permission");
    const member = message.mentions.members.first();
    if (!member) return message.reply("Tag a user");
    await member.kick();
    message.reply(`✅ Kicked ${member.user.tag}`);
  }
  if (cmd === "ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply("❌ No permission");
    const member = message.mentions.members.first();
    if (!member) return message.reply("Tag a user");
    await member.ban();
    message.reply(`✅ Banned ${member.user.tag}`);
  }
  if (cmd === "mute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply("❌ No permission");
    const member = message.mentions.members.first();
    if (!member) return message.reply("Tag a user");
    await member.timeout(10 * 60 * 1000);
    message.reply(`🔇 Muted ${member.user.tag} for 10 minutes`);
  }

  // SHOP
  if (cmd === "shop") message.reply("🛒 Shop: VIP 100 coins | Custom 200 coins\nUse !buy vip / custom");
  if (cmd === "buy") {
    const item = args[0];
    if (!item) return;
    if (item === "vip") {
      if (coins[userId] < 100) return message.reply("❌ Not enough coins");
      coins[userId] -= 100;
      message.reply("✅ VIP bought");
    }
    if (item === "custom") {
      if (coins[userId] < 200) return message.reply("❌ Not enough coins");
      coins[userId] -= 200;
      message.reply("✅ Custom bought");
    }
  }

  // GIVEAWAY
  if (cmd === "giveaway") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply("❌ Admin only");
    const time = parseInt(args[0]);
    const prize = args.slice(1).join(" ");
    if (!time || !prize) return message.reply("Usage: !giveaway <minutes> <prize>");
    const msg = await message.channel.send(`🎉 GIVEAWAY 🎉\nPrize: ${prize}\nReact 🎉\nEnds in ${time} min`);
    await msg.react("🎉");
    setTimeout(async () => {
      const fetched = await msg.fetch();
      const users = await fetched.reactions.cache.get("🎉").users.fetch();
      const entries = users.filter(u => !u.bot);
      if (!entries.size) return message.channel.send("No entries");
      const winner = entries.random();
      message.channel.send(`🏆 ${winner} won **${prize}**`);
    }, time * 60000);
  }

  // MUSIC
  if (cmd === "join") {
    const vc = message.member.voice.channel;
    if (!vc) return message.reply("Join a voice channel first");
    joinVoiceChannel({ channelId: vc.id, guildId: vc.guild.id, adapterCreator: vc.guild.voiceAdapterCreator });
    message.reply("🎵 Joined VC");
  }
  if (cmd === "play") {
    const vc = message.member.voice.channel;
    if (!vc) return message.reply("Join VC first");
    const url = args[0];
    if (!ytdl.validateURL(url)) return message.reply("Invalid YouTube link");
    const connection = joinVoiceChannel({ channelId: vc.id, guildId: vc.guild.id, adapterCreator: vc.guild.voiceAdapterCreator });
    const stream = ytdl(url, { filter: "audioonly", highWaterMark: 1 << 25 });
    const player = createAudioPlayer();
    const resource = createAudioResource(stream);
    player.play(resource);
    connection.subscribe(player);
    message.reply("▶️ Playing");
    player.on(AudioPlayerStatus.Idle, () => connection.destroy());
  }
  if (cmd === "stop") {
    if (!message.guild.members.me.voice.channel) return;
    message.guild.members.me.voice.disconnect();
    message.reply("⏹️ Stopped");
  }
});

// ===============================
// LOGIN
// ===============================
client.login(process.env.TOKEN);
