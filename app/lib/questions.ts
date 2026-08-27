export type Question = {
  id: number;
  title: string;
  prompt: string;
  scene: string;
  options: readonly [string, string, string, string];
};

export const questions = [
  {
    id: 1,
    title: "낯선 동행",
    scene: "stranger",
    prompt: '낯선 사람이 다가와 "같이 가자"고 한다. 당신의 선택은?',
    options: [
      "바로 따라간다",
      "일단 거리를 둔다",
      "다른 사람들과 함께 따라간다",
      "혼자 움직인다",
    ],
  },
  {
    id: 2,
    title: "마지막 한 병",
    scene: "water",
    prompt: "생존에 필요한 물이 딱 한 병 남았다. 어떻게 할 것인가?",
    options: [
      "내가 마신다",
      "가장 약한 사람에게 준다",
      "여러 명이 나눠 마신다",
      "숨겨둔다",
    ],
  },
  {
    id: 3,
    title: "이상 징후",
    scene: "symptom",
    prompt: "일행 중 한 사람이 갑자기 이상증세를 보이기 시작했다.",
    options: [
      "바로 격리한다",
      "무슨 일이 있는지 물어본다",
      "다른 사람들에게 알린다",
      "일단 지켜본다",
    ],
  },
  {
    id: 4,
    title: "줄어드는 식량",
    scene: "food",
    prompt: "식량이 얼마 남지 않았다. 당신의 선택은?",
    options: [
      "지금 다 먹어치운다",
      "최대한 아껴서 나눠 먹는다",
      "다른 사람과 나눈다",
      "새로운 식량을 찾으러 나선다",
    ],
  },
  {
    id: 5,
    title: "남겨진 팀원",
    scene: "injury",
    prompt: "팀원 중 한 명이 다쳤다. 당신의 행동은?",
    options: [
      "응급처치를 시도한다",
      "도움을 요청하러 간다",
      "부축해서 함께 이동한다",
      "내버려두고 나만 대피한다.",
    ],
  },
  {
    id: 6,
    title: "긴급 방송",
    scene: "broadcast",
    prompt: '방송으로 "안전한 곳에 있으라"는 안내가 나온다. 당신의 선택은?',
    options: [
      "안내를 믿고 그대로 있는다",
      "상황을 직접 확인하러 간다",
      "안내와 상관없이 밖으로 나간다",
      "다른 사람들의 반응을 살핀다",
    ],
  },
  {
    id: 7,
    title: "갈림길",
    scene: "paths",
    prompt: "두 갈래 길에서 한쪽은 밝고 한쪽은 어둡다. 당신의 선택은?",
    options: [
      "밝은 쪽으로 간다",
      "어두운 쪽이 더 안전할 것 같아 그쪽으로 간다",
      "직관적으로 정한다.",
      "코카콜라로 정해서 간다.",
    ],
  },
  {
    id: 8,
    title: "꺼져가는 빛",
    scene: "flashlight",
    prompt: "손전등 배터리가 얼마 남지 않았다. 당신의 선택은?",
    options: [
      "최대한 아껴 쓴다",
      "필요할 때 다 써버린다",
      "다른 빛을 찾는다",
      "어둠에 적응하려 노력한다",
    ],
  },
  {
    id: 9,
    title: "배터리 5%",
    scene: "phone",
    prompt:
      "꺼져 있던 휴대폰이 일시적으로 켜졌다. 배터리는 5% 남았을 때 당신의 선택은?",
    options: [
      "112나 119에 즉시 구조 요청을 시도한다",
      "가족이나 가장 소중한 사람에게 메시지를 남긴다",
      "랜턴 기능을 켜서 어두운 길을 먼저 밝힌다",
      "건물 지도나 필요한 정보를 검색해서 확인한다",
    ],
  },
  {
    id: 10,
    title: "마지막 출구",
    scene: "exit",
    prompt: "탈출할 수 있는 길을 발견했지만, 혼자만 빠져나갈 수 있다.",
    options: [
      "혼자 탈출한다",
      "일행을 기다린다",
      "가장 가까운 사람 한 명과 함께 간다",
      "다른 사람에게 먼저 기회를 준다",
    ],
  },
] as const satisfies readonly Question[];

export const optionMarkers = ["①", "②", "③", "④"] as const;
