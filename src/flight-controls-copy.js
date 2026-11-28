import { getLanguage, t } from './i18n.js';

// These strings belong to the flight instruments and their visual keyboard.
const copy = {
  '操控键': ['Controls', 'Commandes', 'Управление'],
  '航天器操控键': ['Spacecraft controls', 'Commandes du vaisseau', 'Управление кораблём'],
  '星际穿梭操控键': [
    'Interstellar controls',
    'Commandes du vol interstellaire',
    'Межзвёздное управление',
  ],
  '接管键盘': ['Take keyboard control', 'Activer le clavier', 'Включить клавиатуру'],
  '点击球面接管键盘，或打开「操控键」。': [
    'Click the ball to pilot, or open Controls.',
    'Cliquez sur la sphère pour piloter, ou ouvrez « Commandes ».',
    'Нажмите на шар для пилотирования или откройте «Управление».',
  ],
  '键盘已接管': ['Keyboard active', 'Clavier actif', 'Клавиатура активна'],
  '转动飞船': ['Rotate the craft', 'Orienter le vaisseau', 'Поворот корабля'],
  '平移飞船': ['Translate the craft', 'Déplacer le vaisseau', 'Смещение корабля'],
  '转动视线': ['Turn the view', 'Orienter la vue', 'Поворот обзора'],
  '移动视点': ['Move the viewpoint', 'Déplacer la caméra', 'Перемещение камеры'],
  '低头': ['Pitch down', 'Piquer', 'Нос вниз'],
  '抬头': ['Pitch up', 'Cabrer', 'Нос вверх'],
  '左偏航': ['Yaw left', 'Lacet gauche', 'Рыск. влево'],
  '右偏航': ['Yaw right', 'Lacet droit', 'Рыск. вправо'],
  '左滚转': ['Roll left', 'Roulis gauche', 'Крен влево'],
  '右滚转': ['Roll right', 'Roulis droit', 'Крен вправо'],
  '前进': ['Forward', 'Avant', 'Вперёд'],
  '后退': ['Back', 'Arrière', 'Назад'],
  '向左': ['Left', 'Gauche', 'Влево'],
  '向右': ['Right', 'Droite', 'Вправо'],
  '向下': ['Down', 'Bas', 'Вниз'],
  '向上': ['Up', 'Haut', 'Вверх'],
  '临时切换 SAS': ['Hold to invert SAS', 'Inverser SAS en maintenant', 'Удерживать для смены SAS'],
  '立即停止': ['Stop now', 'Arrêt immédiat', 'Остановиться'],
  '交还键盘': ['Release keyboard', 'Libérer le clavier', 'Отпустить клавиатуру'],
  '停止并交还键盘': [
    'Stop and release keyboard',
    'Arrêter et libérer le clavier',
    'Остановиться и отпустить клавиатуру',
  ],
  '飞船松开推力后会继续漂移。': [
    'The craft keeps drifting after you release thrust.',
    'Après la poussée, le vaisseau continue sur sa lancée.',
    'Без тяги корабль продолжает дрейфовать.',
  ],
  '平移需要 RCS，按 R 开启。': [
    'Translation needs RCS. Press R to enable it.',
    'La translation requiert le RCS. Appuyez sur R pour l’activer.',
    'Для смещения нужна RCS. Нажмите R.',
  ],
  '按住 H 前进，空格立即停下。': [
    'Hold H to move forward. Space stops immediately.',
    'Maintenez H pour avancer. Espace arrête immédiatement.',
    'Удерживайте H для движения вперёд. Пробел останавливает.',
  ],
  '拖动星空转头，滚轮改变视场。': [
    'Drag the sky to turn. Scroll to change the field of view.',
    'Faites glisser le ciel pour regarder autour de vous. La molette règle le champ.',
    'Перетаскивайте небо для поворота. Колесо меняет поле зрения.',
  ],
  '进入驾驶舱': ['Enter cockpit', 'Entrer dans le poste de pilotage', 'Войти в кабину'],
  '离站，开始飞行': [
    'Undock and start flying',
    'Se désamarrer et commencer le vol',
    'Отстыковаться и начать полёт',
  ],
  '已停靠。离站后可操纵飞船。': [
    'Docked. Undock to take control.',
    'Vaisseau amarré. Désamarrez-vous pour piloter.',
    'Корабль состыкован. Для полёта отстыкуйтесь.',
  ],
  '对接相机小窗': [
    'Docking camera window',
    'Fenêtre de la caméra d’amarrage',
    'Окно стыковочной камеры',
  ],
  '接口已锁定': ['Port locked', 'Port verrouillé', 'Узел состыкован'],
  '对接相机已在主画面': [
    'Docking camera is in the main view',
    'La caméra occupe la vue principale',
    'Камера открыта на главном экране',
  ],
  '放到主画面': ['Show in main view', 'Afficher en vue principale', 'Открыть на главном экране'],
};

export function flightText(key) {
  const index = ['en', 'fr', 'ru'].indexOf(getLanguage());
  return copy[key]?.[index] ?? t(key);
}
