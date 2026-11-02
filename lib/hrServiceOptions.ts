import { SERVICE_OPTIONS } from "@/lib/serviceOptions";
const DEEPNIGHT_SERVICE_GROUPS: Record<
  string,
  Array<{ key: string; name: string; category: string }>
> = {
  特戰英豪: [
    { key: "valorant_god", name: "大神陪玩", category: "特戰英豪" },
    { key: "valorant_skill", name: "技術陪玩", category: "特戰英豪" },
    { key: "valorant_entertain", name: "娛樂陪玩", category: "特戰英豪" },
    { key: "valorant_topup", name: "儲值星雨幣", category: "特戰英豪" },
  ],
  三角洲行動: [
    { key: "delta_pc", name: "電腦版", category: "三角洲行動" },
    { key: "delta_mobile", name: "手機版", category: "三角洲行動" },
    { key: "delta_topup", name: "儲值星雨幣", category: "三角洲行動" },
  ],
  Apex: [
    { key: "apex_god", name: "大神陪玩", category: "Apex" },
    { key: "apex_skill", name: "技術陪玩", category: "Apex" },
    { key: "apex_entertain", name: "娛樂陪玩", category: "Apex" },
    { key: "apex_topup", name: "儲值星雨幣", category: "Apex" },
  ],
  英雄聯盟: [
    { key: "lol_main", name: "英雄聯盟", category: "英雄聯盟" },
    { key: "lol_aram", name: "ARAM", category: "英雄聯盟" },
    { key: "lol_tft", name: "聯盟戰棋", category: "英雄聯盟" },
    { key: "lol_topup", name: "儲值星雨幣", category: "英雄聯盟" },
  ],
  Steam: [
    { key: "steam_roguelike", name: "肉鴿遊戲", category: "Steam" },
    { key: "steam_survival", name: "生存遊戲", category: "Steam" },
    { key: "steam_horror", name: "恐怖遊戲", category: "Steam" },
    { key: "steam_party", name: "派對遊戲", category: "Steam" },
  ],
  王者榮耀: [
    { key: "hok_entertain", name: "娛樂", category: "王者榮耀" },
    { key: "hok_skill", name: "技術", category: "王者榮耀" },
  ],
  第五人格: [
    { key: "identity_v_entertain", name: "娛樂", category: "第五人格" },
    { key: "identity_v_rank_4", name: "四階", category: "第五人格" },
    { key: "identity_v_rank_5", name: "五階", category: "第五人格" },
    { key: "identity_v_rank_6", name: "六階", category: "第五人格" },
    { key: "identity_v_rank_7", name: "七階", category: "第五人格" },
  ],
  其他項目: [
    { key: "pubgm", name: "PUBG M", category: "其他項目" },
    { key: "naraka", name: "NARAKA", category: "其他項目" },
    { key: "minecraft", name: "Minecraft", category: "其他項目" },
    { key: "voice_chat", name: "語音聊天", category: "其他項目" },
    { key: "song", name: "點歌服務", category: "其他項目" },
  ],
};

function getAllowedServiceNameByKey(key: string) {
  if (key === "valorant_god") return "特戰英豪大神陪玩";
  if (key === "valorant_skill") return "特戰英豪技術陪玩";
  if (key === "valorant_entertainment") return "特戰英豪娛樂陪玩";

  if (key === "delta_pc") return "三角洲行動電腦版";
  if (key === "delta_mobile") return "三角洲行動手機版";
  if (key === "delta_entertainment") return "三角洲行動娛樂陪玩";
  if (key === "delta_basic_guard") return "三角洲行動基本單護";
  if (key === "delta_secret_double_guard") return "三角洲行動機密雙護";
  if (key === "delta_attack_guard") return "三角洲行動猛攻護航";

  if (key === "apex_god") return "Apex大神陪玩";
  if (key === "apex_skill") return "Apex技術陪玩";
  if (key === "apex_entertainment") return "Apex娛樂陪玩";

  if (key === "lol_main") return "英雄聯盟";
  if (key === "lol_aram") return "ARAM";
  if (key === "lol_tft") return "聯盟戰棋";
  if (key === "lol_god") return "英雄聯盟大神陪玩";
  if (key === "lol_skill") return "英雄聯盟技術陪玩";
  if (key === "lol_entertainment") return "英雄聯盟娛樂陪玩";

  if (key === "steam_roguelike") return "Steam肉鴿遊戲";
  if (key === "steam_survival") return "Steam生存遊戲";
  if (key === "steam_horror") return "Steam恐怖遊戲";
  if (key === "steam_party") return "Steam派對遊戲";

  if (key === "hok_entertain") return "王者榮耀娛樂";
  if (key === "hok_skill") return "王者榮耀技術";

  if (key === "identity_v_entertain") return "第五人格娛樂";
  if (key === "identity_v_rank_4") return "第五人格四階";
  if (key === "identity_v_rank_5") return "第五人格五階";
  if (key === "identity_v_rank_6") return "第五人格六階";
  if (key === "identity_v_rank_7") return "第五人格七階";

  if (key === "pubgm") return "PUBG M";
  if (key === "naraka") return "NARAKA";
  if (key === "minecraft") return "Minecraft";
  if (key === "voice_chat") return "語音聊天";
  if (key === "song_request") return "點歌服務";

  return key;
}
export function serviceOptionsFor(organization: string) {
  return organization === "deepnight"
    ? Object.values(DEEPNIGHT_SERVICE_GROUPS)
        .flat()
        .map((item) => ({ ...item, group: item.category }))
    : SERVICE_OPTIONS;
}
export function serviceRecord(organization: string, key: string) {
  const option = serviceOptionsFor(organization).find((item) => item.key === key)!;
  return {
    key,
    name: organization === "deepnight" ? option.name : getAllowedServiceNameByKey(key),
    group: option.group,
    allowed: organization === "deepnight" ? key : getAllowedServiceNameByKey(key),
  };
}
