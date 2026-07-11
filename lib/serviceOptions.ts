export type ServiceOption = {
  key: string;
  name: string;
  group: string;
  hint?: string;
};

export const SERVICE_OPTIONS: ServiceOption[] = [
  ["valorant_god", "大神陪玩", "特戰英豪"],
  ["valorant_skill", "技術陪玩", "特戰英豪"],
  ["valorant_entertainment", "娛樂陪玩", "特戰英豪"],
  ["delta_pc", "電腦版", "三角洲行動"],
  ["delta_mobile", "手機版", "三角洲行動"],
  ["delta_entertainment", "娛樂", "三角洲行動"],
  ["delta_basic_guard", "基本單護", "三角洲行動"],
  ["delta_secret_double_guard", "機密雙護", "三角洲行動"],
  ["delta_attack_guard", "猛攻護航", "三角洲行動"],
  ["apex_god", "大神陪玩", "Apex"],
  ["apex_skill", "技術陪玩", "Apex"],
  ["apex_entertainment", "娛樂陪玩", "Apex"],
  ["lol_main", "英雄聯盟", "英雄聯盟", "模式"],
  ["lol_aram", "ARAM", "英雄聯盟", "模式"],
  ["lol_tft", "聯盟戰棋", "英雄聯盟", "模式"],
  ["lol_god", "大神陪玩", "英雄聯盟", "類型"],
  ["lol_skill", "技術陪玩", "英雄聯盟", "類型"],
  ["lol_entertainment", "娛樂陪玩", "英雄聯盟", "類型"],
  ["steam_roguelike", "肉鴿遊戲", "Steam"],
  ["steam_survival", "生存遊戲", "Steam"],
  ["steam_horror", "恐怖遊戲", "Steam"],
  ["steam_party", "派對遊戲", "Steam"],
  ["hok_entertain", "娛樂", "王者榮耀"],
  ["hok_skill", "技術", "王者榮耀"],
  ["identity_v_entertain", "娛樂", "第五人格"],
  ["identity_v_rank_4", "四階", "第五人格"],
  ["identity_v_rank_5", "五階", "第五人格"],
  ["identity_v_rank_6", "六階", "第五人格"],
  ["identity_v_rank_7", "七階", "第五人格"],
  ["pubgm", "PUBG M", "其他項目"],
  ["naraka", "NARAKA", "其他項目"],
  ["minecraft", "Minecraft", "其他項目"],
  ["voice_chat", "語音聊天", "其他項目"],
  ["song_request", "點歌服務", "其他項目"],
].map(([key, name, group, hint]) => ({ key, name, group, hint }));
