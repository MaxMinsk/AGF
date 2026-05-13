# Легкий web-движок для игр, которые пишет ИИ-агент

Дата анализа: 2026-05-13

## Короткий вывод

Идеальный MVP клиентского движка для такой идеи я бы делал не на C#/.NET, а на строгом TypeScript. C# технически можно запустить в браузере через WebAssembly, но для агентской разработки он добавляет второй toolchain, более тяжелую сборку, interop с JavaScript и больший стартовый вес. TypeScript дает почти то, что здесь нужно от C#: строгую типизацию, автодополнение, быстрые ошибки, тесты, рефакторинг, но остается внутри нативной web-экосистемы.

Но C# отлично возвращается в архитектуру как **серверный слой для multiplayer**: authoritative simulation, rooms, matchmaking, persistence, античит, realtime-сообщения и админские tools. Поэтому правильная формула не “C# или TypeScript”, а **TypeScript client/runtime + optional C#/.NET backend**.

Рекомендуемая база:

- **Язык:** TypeScript с максимально строгим `tsconfig`.
- **Сборка/dev:** Vite, потому что HMR и ESM хорошо ложатся на hot reload.
- **3D/2D рендер:** Three.js как единый рендер-слой для MVP: 3D сцена плюс ортографические 2D-слои.
- **Физика:** Rapier JS/WASM, отдельно 2D и 3D миры.
- **Сцены/префабы:** JSON или JSONC с JSON Schema, нормализованные в runtime-модель.
- **Тесты:** Vitest для систем и валидаторов, Playwright для headless-игры, скриншотов и робот-плейтестов.
- **Архитектура:** pragmatic ECS + command pipeline + функциональное ядро. MVVM/HMVC оставить для инспектора и UI, а не для gameplay runtime.
- **Шейдеры:** текстовые `.glsl` файлы плюс typed manifest для uniforms, hot reload и validation.
- **Backend-ready слой:** опциональный ASP.NET Core backend на C# для realtime multiplayer, комнат, авторизации, persistence и серверной симуляции.

Главная продуктовая мысль: движок должен быть не “мини-Unity в браузере”, а **кодовая среда, в которой агенту сложно ошибиться молча**. Важнее не визуальный редактор, а быстрый цикл: поправил текст, валидатор объяснил ошибку, headless-прогон показал поведение, скриншот дал визуальную обратную связь.

## Цель движка

Движок должен позволять ИИ-агенту создавать маленькие и средние web-игры без ручного кликанья по редактору:

- 2D: платформеры, аркады, карточные игры, top-down, простые стратегии, UI-heavy игры.
- 3D: third-person/first-person прототипы, простые физические игры, low-poly сцены, интерактивные прогулки.
- Шейдерные эффекты: вода, dissolve, outlines, hit flash, fullscreen postprocess, stylized materials.
- Быстрый deploy: single-player результат должен собираться в обычный статический сайт.
- Backend deploy: multiplayer-проект должен уметь поднимать отдельный сервер без переписывания клиентского gameplay API.
- Агентский цикл: validate -> run -> inspect -> mutate -> screenshot -> playtest -> report.

Что не стоит пытаться покрыть в первой версии:

- AAA-графику, сложный PBR-пайплайн и полноценный terrain editor.
- Visual scripting.
- Полноценный MMO/large-scale realtime multiplayer. Но backend seam и базовые rooms/realtime contracts стоит заложить сразу.
- Большой editor-first workflow с бинарными ресурсами и скрытыми метаданными.
- Песочницу для произвольного непроверенного кода как в Roblox. Это отдельная сложная тема безопасности.

## Почему TypeScript на клиенте, а C# на сервере

C# эмоционально понятен, особенно если есть Unity-бэкграунд. Но если цель именно browser-runtime под агента, TypeScript выигрывает по циклу разработки. Если цель - backend для multiplayer, C# становится очень сильным кандидатом.

### Что дает C#

- Строгие типы, классы, интерфейсы, привычная Unity-подобная модель.
- Хороший unit-testing и зрелая экосистема.
- Возможность использовать .NET WebAssembly и JS interop.
- AOT-компиляция может ускорить CPU-heavy код.
- ASP.NET Core, SignalR/WebSockets, gRPC/gRPC-Web, hosted services, observability и зрелая серверная экосистема.
- Хорошая модель для authoritative game server: типы, DI, тесты, background loops, профилирование.

### Где C# начинает мешать на клиенте

- Браузерный rendering, DOM, WebGL/WebGPU, input, audio и dev-server все равно живут в JS/TS мире.
- Interop между C# и JS становится архитектурным налогом.
- .NET WebAssembly добавляет вес runtime и сложность сборки.
- AOT улучшает производительность, но обычно увеличивает размер загрузки.
- Для агента важнее скорость итерации и простота диагностики, чем “родной” C# синтаксис.

Microsoft официально поддерживает .NET WebAssembly, JS interop и AOT для Blazor/WebAssembly, но их же документация описывает tradeoff AOT: быстрее CPU, но тяжелее download. Для движка, который должен открываться как легкий сайт, это плохая цена на старте.

### Где C# хорошо ложится на multiplayer backend

- **Realtime:** ASP.NET Core SignalR дает WebSocket-first realtime API с fallback transport и удобной моделью groups/clients.
- **Low-level transport:** raw WebSockets в ASP.NET Core подходят, если нужен полный контроль над бинарным протоколом и tick-rate.
- **Typed RPC:** gRPC-Web полезен для lobby, inventory, economy, profiles, но не для browser bidirectional gameplay streaming, потому что gRPC-Web в браузере имеет ограничения.
- **Оркестрация:** .NET Aspire можно использовать позже для локального и production-управления несколькими сервисами: game server, lobby, database, cache, telemetry.
- **Тесты:** серверную симуляцию можно гонять headless без браузера, с deterministic ticks и snapshot-тестами.

### Что дает TypeScript

- Строгие типы без ухода из браузерной экосистемы.
- Быстрый `tsc --noEmit`, быстрые тесты и HMR.
- Нативная совместимость с Three.js, Rapier, Playwright, Vite.
- Агенты хорошо чинят TS-ошибки: файл, строка, тип, контракт.
- JSON Schema/Zod/Ajv закрывают runtime-валидацию внешних данных, где TypeScript сам по себе не работает.

Рекомендация: **TypeScript как основной язык клиентской логики**, C# как рекомендуемый backend language для multiplayer. Не строить browser MVP вокруг .NET, но сразу проектировать протоколы и gameplay systems так, чтобы часть логики могла жить на сервере.

## Принципы agent-first архитектуры

Обычный движок проектируется вокруг редактора. Этот движок должен проектироваться вокруг файлов, валидаторов и команд.

### 1. Текст как source of truth

Все важное хранится в читаемых файлах:

- `project.json` - настройки проекта.
- `scenes/*.scene.json` - сцены.
- `prefabs/*.prefab.json` - шаблоны объектов.
- `scripts/*.ts` - gameplay logic.
- `systems/*.ts` - системная логика.
- `shaders/**/*.glsl` - shader source.
- `materials/*.material.json` - typed материалы.
- `playtests/*.playtest.ts` - сценарии проверки.

Инспектор может двигать объекты мышкой, но его результатом должен быть patch в JSON, а не скрытое состояние в редакторе.

### 2. Все данные валидируются до запуска

Агент будет часто ошибаться в именах компонентов, ссылках на assets, типах uniforms и путях. Значит, validate-команда должна быть центральной:

```bash
engine check
```

Она должна находить:

- несуществующие prefab/material/asset ссылки;
- неизвестные компоненты;
- несовместимые 2D/3D компоненты;
- неправильные типы uniforms;
- циклы prefab inheritance;
- дублирующиеся entity ids;
- unreachable trigger volumes;
- missing spawn point/player/camera;
- script exports с неправильным контрактом.

### 3. Runtime-изменения идут через команды

Любое изменение мира должно быть командой:

```ts
type EngineCommand =
  | { type: "entity.create"; entity: EntityDef }
  | { type: "entity.delete"; id: EntityId }
  | { type: "component.set"; id: EntityId; component: string; value: unknown }
  | { type: "scene.load"; scene: string }
  | { type: "asset.reload"; path: string };
```

Это дает сразу несколько бонусов:

- hot reload можно делать как набор patches;
- инспектор получает undo/redo почти бесплатно;
- агентский bridge может безопасно менять сцену;
- playtest можно записывать и воспроизводить;
- баги легче репортить как command log.

### 4. Функциональное ядро, императивная оболочка

Gameplay-системы должны по максимуму быть чистыми функциями:

```ts
export function updateHealthRegen(world: WorldView, dt: Seconds): Command[] {
  // читает компоненты, возвращает команды, не трогает renderer/DOM напрямую
}
```

Renderer, audio, input, browser APIs и физика остаются в императивной оболочке. Это резко упрощает тесты и агентские правки: агент может менять правила игры без случайного доступа к глобальному состоянию.

### 5. Маленькие API-контракты важнее “свободы”

Агент лучше работает, когда выбор ограничен хорошими рельсами:

- компоненты маленькие и data-only;
- systems имеют одинаковую форму;
- сцены используют стабильный schema format;
- lifecycle hooks минимальны;
- ошибки говорят, что исправить.

Слишком “свободный” движок быстро превращается в хаотичный набор скриптов, где агент каждый раз изобретает новый стиль.

## Архитектуры: ECS, HMVC, MVVM и что выбрать

### ECS

**Вердикт:** лучший базовый паттерн для runtime, но в прагматичной форме.

ECS хорошо подходит агентам:

- Entity - простой id.
- Component - маленький JSON-объект.
- System - отдельный TS-файл с понятным контрактом.
- Сцены легко валидировать.
- Поведение легко тестировать пакетами.

Но не стоит начинать с “идеального” high-performance archetype ECS. Он даст сложность раньше, чем пользу. Для MVP лучше:

- sparse storage: `Map<ComponentType, Map<EntityId, ComponentData>>`;
- queries с типизированными helpers;
- фиксированный update order;
- command buffer;
- serialization-friendly data.

Пример компонента:

```ts
export const Health = defineComponent("Health", z.object({
  current: z.number().min(0),
  max: z.number().positive(),
  regenPerSecond: z.number().default(0)
}));
```

Пример системы:

```ts
export const HealthRegenSystem = defineSystem({
  id: "game.healthRegen",
  reads: [Health],
  writes: [Health],
  update(ctx) {
    for (const [entity, health] of ctx.query(Health)) {
      if (health.current < health.max) {
        ctx.set(entity, Health, {
          ...health,
          current: Math.min(health.max, health.current + health.regenPerSecond * ctx.dt)
        });
      }
    }
  }
});
```

### Actor/Component как в Unity

**Вердикт:** хорошая authoring-модель, но не лучший внутренний runtime.

Unity-подход знаком: GameObject + Components + MonoBehaviour lifecycle. Для пользователя с Unity-бэкграундом это удобно, и агенту тоже легко сказать “добавь EnemyBrain на объект”.

Проблема: если сделать runtime вокруг mutable objects и lifecycle hooks, появятся скрытые зависимости:

- порядок `Start/Update` становится магией;
- компоненты начинают напрямую дергать друг друга;
- hot reload сложнее;
- тестировать отдельную логику труднее.

Решение: дать Unity-похожий facade для authoring, но внутри держать ECS:

- scene JSON выглядит как “objects with components”;
- runtime нормализует это в ECS-хранилище;
- scripts пишутся как systems или typed behaviors;
- inspector показывает entity tree, но сохраняет ECS-compatible JSON.

### Scene Graph

**Вердикт:** нужен для transform hierarchy и rendering, но не как единственная архитектура.

Scene graph удобен для:

- parent/child transform;
- камер;
- attach points;
- UI/world layers;
- gizmos и inspector.

Но gameplay-логику лучше не привязывать к дереву. Дерево должно быть компонентом `Transform`, а не центром всего движка.

Практичная модель:

- `Transform` хранит local position/rotation/scale and parent id.
- `TransformSystem` считает world matrices.
- Render systems читают `Transform` и `MeshRenderer`/`SpriteRenderer`.
- Physics systems синхронизируются с `Transform` через явные rules.

### MVVM

**Вердикт:** полезен для UI/HUD/editor, не для игрового мира.

MVVM хорошо подходит для:

- inspector panel;
- debug UI;
- HUD counters;
- inventory screen;
- menus;
- settings.

Но gameplay world через MVVM получится слишком UI-центричным. Не нужно делать `PlayerViewModel` центром симуляции. Лучше:

- ECS хранит gameplay state;
- UI подписывается на readonly selectors;
- UI отправляет commands;
- inspector использует MVVM-ish state локально.

### HMVC

**Вердикт:** можно использовать для editor/tools, но runtime будет тяжелее, чем нужно.

HMVC удобен для больших приложений с независимыми модулями UI. В игровом движке под агента он может помочь в:

- editor shell;
- asset browser;
- inspector;
- scene hierarchy;
- playtest dashboard.

Но для gameplay он добавит слой терминологии, который агенту придется постоянно поддерживать. Для MVP лучше command-based tools + ECS runtime.

### Event-driven architecture

**Вердикт:** использовать аккуратно, только для событий домена и integration events.

События нужны:

- `collision.enter`;
- `trigger.exit`;
- `animation.finished`;
- `audio.finished`;
- `quest.completed`;
- `ui.clicked`.

Но если все сделать event bus, логика станет невидимой. Агенту будет тяжело понять “кто на что подписан”. Правило:

- state changes через commands;
- transient notifications через events;
- события типизированы;
- подписки объявлены явно в system manifest.

### Data-oriented design

**Вердикт:** держать в уме, но не оптимизировать преждевременно.

Для 10-5000 entity простой ECS на `Map` будет достаточно удобным. Когда появятся реальные performance bottlenecks, можно оптимизировать конкретные компоненты:

- transforms в typed arrays;
- particles/tiles через instancing;
- physics sync batch;
- render lists кешировать.

Для агента ранний data-oriented код может стать слишком низкоуровневым. Сначала нужна ясность.

## Рекомендуемая архитектура ядра

```text
engine/
  core/
    world/
    ecs/
    commands/
    scheduler/
    assets/
    schemas/
  runtime/
    browser/
    input/
    audio/
    hot-reload/
    net/
  render/
    three/
    materials/
    shaders/
    debug-gizmos/
  physics/
    rapier2d/
    rapier3d/
  tools/
    cli/
    inspector/
    agent-bridge/
    playtest-runner/
  server/
    protocol/
    sync/
    adapters/
  testkit/
    fixtures/
    assertions/
```

Для игры:

```text
my-game/
  project.json
  scenes/
    start.scene.json
    level-01.scene.json
  prefabs/
    player.prefab.json
    enemy.prefab.json
    coin.prefab.json
  assets/
    models/
    sprites/
    audio/
    textures/
  materials/
    toon.material.json
    water.material.json
  shaders/
    water.vert.glsl
    water.frag.glsl
  scripts/
    player-controller.ts
    enemy-brain.ts
  systems/
    scoring-system.ts
  net/
    messages.schema.json
    replication.json
  server/
    GameServer.csproj
    Program.cs
    Rooms/
    Simulation/
    Transport/
  playtests/
    level-01-smoke.playtest.ts
    level-01-robot.playtest.ts
```

## Сцены и префабы

Сцена должна быть простой для агента и стабильной для diff.

Пример:

```json
{
  "$schema": "../schemas/scene.schema.json",
  "id": "level-01",
  "entities": [
    {
      "id": "player",
      "name": "Player",
      "prefab": "prefabs/player.prefab.json",
      "components": {
        "Transform": {
          "position": [0, 1, 0],
          "rotation": [0, 0, 0],
          "scale": [1, 1, 1]
        },
        "PlayerInput": {
          "moveSpeed": 6,
          "jumpSpeed": 8
        },
        "ThirdPersonCameraTarget": {
          "distance": 5,
          "height": 2
        }
      }
    }
  ]
}
```

Правила:

- Entity ids стабильные и человекочитаемые.
- Prefab inheritance разрешен, но ограничен глубиной.
- Override-компоненты явно видны.
- Порядок entities не должен влиять на runtime.
- Runtime нормализует сцену перед запуском.
- Нормализованную сцену можно snapshot-тестировать.

Для 2D можно дать компактный authoring-sugar:

```json
{
  "id": "coin-01",
  "components": {
    "Transform2D": { "x": 120, "y": 80, "layer": 3 },
    "SpriteRenderer": { "sprite": "sprites/coin.png" },
    "CircleTrigger2D": { "radius": 12 },
    "Collectible": { "score": 10 }
  }
}
```

Внутри движок может нормализовать `Transform2D` в общий transform pipeline.

## 2D и 3D в одном движке

Есть два варианта.

### Вариант A: один renderer на Three.js

Плюсы:

- один canvas;
- один asset pipeline;
- один material/shader pipeline;
- проще overlay 2D поверх 3D;
- проще скриншоты и headless-тесты;
- меньше зависимостей.

Минусы:

- 2D API придется дописать самим;
- tilemap/sprite batching надо делать аккуратно;
- текст и UI потребуют отдельного слоя.

Для MVP это лучший путь. Three.js официально покрывает renderer, cameras, materials, loaders, shaders, controls, WebGL и WebGPU-related APIs. Для 2D можно использовать:

- orthographic camera;
- sprites as planes/instanced quads;
- texture atlases;
- tilemap chunks as instanced meshes;
- z/layer sorting;
- separate UI DOM layer для обычных меню.

### Вариант B: Three.js для 3D + PixiJS для 2D

Плюсы:

- PixiJS сильнее в 2D batching, filters, sprites, text;
- быстрее получить polished 2D.

Минусы:

- два renderer pipeline;
- сложнее порядок слоев, input picking, resize, screenshots;
- два shader формата/абстракции;
- агенту сложнее выбирать, где объект должен жить.

Этот вариант можно добавить позже как optional adapter: `renderer2d: "pixi"`. В MVP лучше не усложнять.

## Шейдеры

Шейдеры должны быть first-class assets, а не случайные строки внутри TS-файлов.

Пример manifest:

```json
{
  "$schema": "../schemas/shader.schema.json",
  "id": "fx/water",
  "language": "glsl",
  "vertex": "shaders/water.vert.glsl",
  "fragment": "shaders/water.frag.glsl",
  "uniforms": {
    "uTime": { "type": "float", "default": 0 },
    "uWaveScale": { "type": "float", "default": 0.4 },
    "uTint": { "type": "color", "default": "#4fb3ff" }
  }
}
```

Что должен делать engine:

- валидировать наличие shader files;
- валидировать uniforms;
- генерировать TypeScript type для material params;
- hot reload shader source без перезапуска сцены;
- показывать shader compile errors с файлом и строкой;
- fallback material при ошибке, чтобы сцена не становилась черным экраном;
- поддерживать fullscreen postprocess passes.

Стартовый уровень:

- Three.js `ShaderMaterial`/`RawShaderMaterial`;
- GLSL для WebGL;
- отдельный postprocess composer;
- typed uniforms.

Будущий уровень:

- WebGPU backend, где возможно;
- WGSL shader manifests;
- Node-based material graph, если захочется визуального authoring.

Важно: не обещать полную WebGPU-first архитектуру в MVP. WebGPU перспективен, но WebGL2 до сих пор нужен для широкой совместимости.

## Физика

Rapier - хороший выбор, потому что есть 2D и 3D physics engines, JavaScript bindings, rigid bodies, colliders, collision detection и character controller.

Рекомендуемая модель:

- `PhysicsWorld2D` и `PhysicsWorld3D` раздельно.
- Fixed timestep, например `1 / 60`.
- Render interpolation отдельно от physics step.
- Physics components data-only.
- Collision events превращаются в typed events.
- Character controller завернуть в свой компонент, а не отдавать агенту низкоуровневый Rapier API.

Компоненты:

```ts
RigidBody2D
Collider2D
RigidBody3D
Collider3D
CharacterController3D
TriggerVolume2D
TriggerVolume3D
```

Правило синхронизации:

- dynamic body пишет transform после physics step;
- kinematic body читает transform до physics step;
- static body обновляется только при изменении сцены;
- teleports идут через command, чтобы physics cache не ломался молча.

## Input

Input должен быть action-based, не key-based:

```json
{
  "actions": {
    "move.forward": ["KeyboardW", "ArrowUp", "GamepadLeftY-"],
    "move.backward": ["KeyboardS", "ArrowDown", "GamepadLeftY+"],
    "jump": ["Space", "GamepadSouth"],
    "interact": ["KeyE", "GamepadWest"]
  }
}
```

Плюсы:

- агент может писать playtests через actions;
- remapping проще;
- robot player не зависит от клавиш;
- touch controls можно добавить поверх actions.

## Hot reload

Hot reload должен быть не просто “Vite перезагрузил страницу”. Ценность именно в сохранении gameplay state.

Что reload-ить:

- scene JSON: diff -> commands -> apply;
- prefab JSON: update instances with override rules;
- material JSON: update uniforms/textures;
- shader files: recompile material;
- scripts/systems: replace module, keep component state;
- assets: reload by path/hash.

Что сохранять:

- player position;
- current scene state, если изменение не удаляет entity;
- physics velocity where possible;
- camera state;
- debug options;
- random seed.

Что сбрасывать:

- module-local variables in reloaded scripts;
- transient effects;
- invalid physics bodies after shape changes;
- compiled shader programs.

Нужен явный контракт:

```ts
export const PlayerController = defineBehavior({
  id: "game.playerController",
  onAttach(ctx) {},
  update(ctx) {},
  onDetach(ctx) {},
  onHotReload(previousModuleState) {}
});
```

Но lifecycle hooks должны быть редкими. Большая часть логики должна жить в systems.

## Backend и multiplayer

Backend нужно заложить сразу как архитектурную возможность, даже если первый playable MVP останется single-player. Главное - не смешивать browser runtime и server runtime в один комок.

### Deploy-модель

Движок должен поддерживать три профиля:

- `static`: чистый single-player, сборка в статический сайт.
- `connected`: статический клиент + backend для профилей, лидербордов, сохранений, матчмейкинга, async-событий.
- `authoritative`: клиент + C# game server, где сервер владеет важной симуляцией и рассылает snapshots/events.

Это сохраняет легкость: маленькие игры не платят ценой backend, а multiplayer-проекты не требуют переписывать весь клиент.

### Почему C# здесь уместен

C#/.NET на сервере хорошо совпадает с Unity-бэкграундом и задачами multiplayer:

- строгие типы и хорошие refactoring tools;
- ASP.NET Core для HTTP, WebSockets, SignalR, auth и hosting;
- hosted services/background loops для game ticks;
- DI/config/logging/metrics из коробки;
- удобные integration/unit tests;
- возможность в будущем выделять rooms, lobby, persistence и analytics в сервисы.

Браузерный клиент остается TypeScript, потому что renderer/input/assets/HMR живут там. Серверный gameplay может быть C#, потому что ему не нужен DOM/WebGL.

### Transport strategy

Для разных типов multiplayer нужны разные протоколы:

- **SignalR:** лучший default для MVP multiplayer, lobby, rooms, casual realtime, co-op, party games. Он упрощает connection management, groups и server-to-client calls.
- **Raw WebSocket:** выбрать позже для fast action games, если нужен бинарный протокол, жесткий tick-rate, compression control и минимальный overhead.
- **HTTP/REST:** profiles, auth, inventory, leaderboard, content manifest.
- **gRPC-Web:** typed unary/server-streaming API для tooling и backend services, но не основной gameplay transport для браузерного realtime, потому что browser gRPC-Web не дает полноценный bidirectional streaming.

Практичная рекомендация:

- Milestone backend MVP: SignalR.
- Performance milestone: optional raw WebSocket adapter.
- Internal service-to-service later: обычный gRPC внутри backend, не обязательно наружу в браузер.

### Authoritative simulation

Для multiplayer нельзя полагаться на клиент как на источник правды. Даже если игра дружелюбная и маленькая, архитектура должна позволять серверу быть authoritative.

Минимальная схема:

```text
client input actions -> server command queue
server fixed tick -> authoritative world state
server snapshot/events -> clients
client prediction/interpolation -> smooth local rendering
```

Клиент отправляет не “я стою в точке X”, а намерения:

```json
{
  "type": "input.frame",
  "seq": 1842,
  "actions": {
    "move": [0.4, 1.0],
    "jump": false,
    "fire": true
  }
}
```

Сервер отвечает snapshot/event:

```json
{
  "type": "world.snapshot",
  "tick": 9120,
  "entities": [
    {
      "id": "player-1",
      "components": {
        "NetTransform": {
          "position": [12.4, 1.0, -3.2],
          "rotation": [0, 1.57, 0]
        },
        "Health": { "current": 80, "max": 100 }
      }
    }
  ]
}
```

### Shared contracts

Нельзя допустить, чтобы TypeScript-клиент и C#-сервер расходились в форматах сообщений. Источник правды должен быть один:

- JSON Schema для scene/prefab/material остается полезной для content.
- Protocol schemas для network messages должны генерировать TypeScript и C# типы.
- Для MVP можно начать с JSON messages + schema validation.
- Для performance можно перейти на MessagePack или protobuf, сохранив codegen.

Пример структуры:

```text
net/
  protocol/
    input.schema.json
    snapshot.schema.json
    lobby.schema.json
  generated/
    ts/
    cs/
```

### Что должно быть в C# backend

```text
server/
  GameServer.csproj
  Program.cs
  Rooms/
    Room.cs
    RoomRegistry.cs
    Matchmaker.cs
  Simulation/
    ServerWorld.cs
    ServerTickLoop.cs
    CommandQueue.cs
    SnapshotBuilder.cs
  Transport/
    GameHub.cs
    WebSocketGameTransport.cs
  Persistence/
    PlayerProfileStore.cs
    MatchResultStore.cs
  Tests/
    SimulationTests.cs
    ProtocolCompatibilityTests.cs
```

Ключевое правило: server simulation не должна зависеть от Three.js, DOM, browser input или rendering. Она должна зависеть от shared gameplay contracts, deterministic systems и server-only adapters.

### Как совместить TS gameplay и C# server gameplay

Есть три стратегии.

**Стратегия A: сервер симулирует только coarse state.**

Подходит для MVP co-op/casual игр:

- Клиент отвечает за локальную физику/анимации.
- Сервер валидирует high-level commands: pickup, damage, score, room state.
- Меньше дублирования логики.
- Проще начать.
- Хуже для competitive action.

**Стратегия B: gameplay rules генерируются из data/contracts.**

Подходит для agent-first engine:

- Большая часть баланса в JSON: abilities, damage, cooldowns, collision layers.
- TS и C# читают одинаковые data contracts.
- Сервер исполняет critical rules.
- Клиент исполняет prediction/visual rules.

**Стратегия C: shared simulation core на WASM или одном языке.**

Теоретически красиво, но для MVP тяжело:

- C# core в браузере вернет WebAssembly overhead.
- TS core на сервере уберет C# из gameplay.
- Rust/WASM даст третий язык.

Рекомендация: начать со стратегии B, а для первого multiplayer spike использовать A. То есть сразу проектировать shared data/contracts, но не пытаться идеально дублировать всю симуляцию.

### Network components

В ECS стоит заложить сетевые компоненты, даже если они пустые в single-player:

```ts
NetworkIdentity
NetworkOwner
Replicated
Predicted
Interpolated
ServerAuthority
ClientAuthority
```

Пример:

```json
{
  "components": {
    "NetworkIdentity": { "netId": "player-1" },
    "NetworkOwner": { "clientId": "connection-42" },
    "Replicated": {
      "components": ["Transform", "Health", "AnimationState"],
      "rate": 20
    },
    "Predicted": {
      "input": "PlayerInput",
      "reconcile": true
    }
  }
}
```

Важно: обычная single-player сцена не обязана иметь эти компоненты. Multiplayer - это plugin/profile, а не обязательный налог на каждую игру.

### Agent tooling для backend

Agent bridge должен уметь работать не только с браузером, но и с сервером:

```bash
engine server check
engine server run --rooms 2
engine net simulate --clients 8 --duration 60s
engine net record --out .agent/net/replay.json
engine net replay .agent/net/replay.json
engine net fuzz --protocol input --cases 1000
```

Тесты для multiplayer:

- protocol compatibility: TS/C# генерируют одинаковые message contracts;
- deterministic server tick tests;
- simulated clients;
- disconnect/reconnect tests;
- latency/jitter simulation;
- snapshot size budget;
- anti-cheat validation tests for impossible inputs.

### Минимальный multiplayer MVP

Первую сетевую версию лучше делать не с physics-heavy shooter, а с чем-то, где архитектура проверится без боли:

- lobby + room;
- 2-4 players;
- shared positions;
- collectibles или simple co-op goal;
- server-owned score;
- reconnect;
- robot clients in headless tests.

Это даст все важные seam: auth-ish identity, room lifecycle, transport, snapshots, input commands, server tests.

## Агентский bridge

Главная фишка проекта - bridge для Claude Code/Cursor/Codex-подобных агентов. Его лучше делать CLI-first, а MCP/HTTP/WebSocket поверх.

Команды:

```bash
engine check
engine run --headless
engine screenshot --scene level-01 --out .agent/screens/level-01.png
engine inspect --scene level-01 --format json
engine query "entities with Collider3D but without RigidBody3D"
engine mutate --patch patch.json
engine playtest playtests/level-01-robot.playtest.ts --runs 30 --seed 42
engine trace --last-run
engine perf --budget budgets/mobile.json
```

Bridge должен возвращать machine-readable JSON:

```json
{
  "ok": false,
  "diagnostics": [
    {
      "severity": "error",
      "file": "scenes/level-01.scene.json",
      "path": "$.entities[3].components.MeshRenderer.material",
      "message": "Material 'materials/toon-blue.material.json' does not exist",
      "suggestion": "Did you mean 'materials/toon.material.json'?"
    }
  ]
}
```

Для визуальной оценки:

- Playwright запускает браузер headless;
- движок экспортирует debug overlay;
- тесты сохраняют screenshots;
- pixel checks ловят blank canvas;
- агент может “посмотреть” скриншот и попросить изменения.

Для робот-плейтестов:

- seedable RNG;
- action-level input;
- metrics: win rate, deaths, time to win, stuck time, average fps;
- command log для failed run;
- final screenshot/video/trace.

## Тестовая стратегия

Минимальный набор:

- `typecheck`: `tsc --noEmit`.
- `unit`: Vitest для math, ECS queries, commands, validators.
- `schema`: все сцены, prefab, material, shader manifest проходят validation.
- `snapshot`: normalized scene snapshot.
- `headless-smoke`: Playwright открывает сцену и проверяет, что canvas не пустой.
- `robot`: deterministic playtest с seed.
- `server`: C# simulation tests, room lifecycle tests, protocol compatibility tests.
- `net-sim`: simulated clients with latency/jitter/disconnect scenarios.
- `perf`: budget на draw calls, entities, frame time.

Пример playtest:

```ts
import { playtest } from "@engine/testkit";

export default playtest("level-01 can be completed", async (game) => {
  await game.loadScene("level-01");
  await game.robot.runPolicy("reach-goal", { maxSeconds: 60 });

  await game.expect.metric("player.deaths").toBeLessThan(3);
  await game.expect.event("goal.reached").toHaveHappened();
  await game.screenshot("final");
});
```

## TypeScript strictness

Рекомендуемый baseline:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true
  }
}
```

Почему так:

- `strict` включает основной набор сильных проверок.
- `noUncheckedIndexedAccess` ловит ошибки в component maps и asset dictionaries.
- `exactOptionalPropertyTypes` полезен для JSON overrides.
- `noImplicitOverride` помогает при plugin APIs.
- `verbatimModuleSyntax` снижает магию imports/exports.

Важно: TypeScript не валидирует JSON во время runtime. Поэтому нужны Zod/Ajv/JSON Schema.

## Asset pipeline

3D:

- основной формат: glTF/GLB;
- texture compression позже: KTX2/Basis;
- animation clips из glTF;
- materials можно override-ить engine material manifests.

2D:

- spritesheets/atlases;
- tilemaps в JSON;
- bitmap fonts или SDF text;
- simple animation clips.

Audio:

- Web Audio;
- 3D positional audio для world sounds;
- 2D bus для UI/music;
- mixer groups: `master`, `music`, `sfx`, `ui`, `ambience`.

Assets должны ссылаться по путям или стабильным ids. Не стоит вводить Unity-подобные скрытые `.meta` файлы в первой версии. Если ids понадобятся, они должны генерироваться детерминированно и быть читаемыми.

## Inspector

Inspector нужен, но не как главный editor.

MVP inspector:

- F2 overlay;
- entity tree;
- component list;
- transform gizmo;
- selected entity bounds;
- add/remove component;
- live JSON patch preview;
- copy entity JSON;
- “explain diagnostics” panel.

Принцип: inspector не хранит приватную правду. Он только читает runtime state и пишет patches в source files.

## UI/HUD

Для runtime UI есть два пути:

- DOM overlay для меню, HUD, debug UI.
- Canvas/Three layer для diegetic UI, nameplates, world labels.

Для MVP:

- DOM overlay для обычного UI.
- MVVM-ish store для UI state.
- UI actions отправляют engine commands.
- Gameplay state читается через selectors.

Не нужно тащить большой frontend framework в core runtime. Для inspector можно использовать Preact/Svelte, но gameplay engine должен жить отдельно.

## Плагины

Сразу заложить plugin API, но держать его маленьким:

```ts
export interface EnginePlugin {
  id: string;
  components?: ComponentDef[];
  systems?: SystemDef[];
  assetLoaders?: AssetLoaderDef[];
  commands?: CommandHandlerDef[];
  inspectors?: InspectorPanelDef[];
}
```

Плагины нужны для:

- 2D extras;
- dialogue;
- inventory;
- navmesh;
- particles;
- postprocessing;
- analytics;
- platform SDKs.

Каждый plugin должен иметь:

- schema;
- tests;
- docs/examples;
- validation diagnostics.

## Безопасность пользовательских скриптов

Если игры делает локальный агент в доверенной папке, можно запускать TS как обычный bundled code. Если когда-нибудь появится marketplace или untrusted code, нужна другая модель:

- sandboxed iframe;
- restricted API;
- message passing;
- capability-based permissions;
- build-time lint rules;
- возможно SES/realms, если зрелость устроит.

В MVP не стоит обещать безопасный untrusted scripting. Это отдельный продуктовый уровень.

## Roadmap

### Milestone 0: технический spike

Цель: доказать цикл.

- Vite + TypeScript + Three.js.
- Один JSON scene loader.
- Один cube/player.
- `engine check`.
- Playwright screenshot.
- Vitest unit test.

### Milestone 1: core world

- ECS storage.
- Component schemas.
- Commands.
- Transform hierarchy.
- Render loop.
- Asset registry.
- Scene/prefab loading.
- Basic hot reload scene JSON.

### Milestone 2: 3D gameplay

- MeshRenderer.
- Camera components.
- Third-person controller.
- Rapier3D rigid bodies/colliders.
- Trigger volumes.
- Animation clips.
- Positional audio.

### Milestone 3: 2D gameplay

- Orthographic camera.
- SpriteRenderer.
- Sprite animation.
- Tilemap chunks.
- Rapier2D colliders.
- 2D sample game.

### Milestone 4: shaders/materials

- Material manifests.
- Shader manifests.
- Typed uniforms.
- Hot reload GLSL.
- Postprocess pass.
- Shader error diagnostics.

### Milestone 5: agent bridge

- `inspect`, `query`, `mutate`.
- Headless runner.
- Robot input.
- Metrics.
- Screenshots.
- Trace logs.

### Milestone 6: backend-ready multiplayer spike

- C# ASP.NET Core server scaffold.
- SignalR rooms/lobby.
- Shared protocol schemas with TS/C# generated types.
- `NetworkIdentity`, `Replicated`, `Predicted` components.
- Server tick loop.
- Snapshot/events pipeline.
- Simulated clients test runner.
- 2-4 player co-op sample.

### Milestone 7: examples and hardening

- 2D platformer.
- 3D third-person collectathon.
- Top-down shooter.
- Multiplayer co-op microgame.
- Shader playground.
- Performance budgets.
- Documentation for agents.

## Что считать успехом

Движок попал в цель, если агент может:

- добавить нового врага через prefab и scene JSON;
- починить ошибку по diagnostic message;
- написать новую gameplay system с unit test;
- запустить headless playtest;
- получить screenshot и улучшить визуал;
- изменить shader uniform/material без перезапуска игры;
- пройти smoke-тесты перед сборкой;
- собрать игру как статический сайт.
- включить backend profile и поднять C# server для multiplayer-сцены;
- прогнать simulated multiplayer clients и получить сетевой replay.

Неудачный результат выглядит так:

- агент постоянно правит random runtime code без схем;
- ошибки видны только в browser console;
- hot reload сбрасывает всю игру;
- сцены невозможно diff-ить;
- inspector пишет скрытое состояние;
- 2D и 3D живут как два разных движка;
- multiplayer требует переписать gameplay API вместо подключения network profile;
- TS/C# network contracts расходятся руками;
- тесты проверяют только “страница открылась”.

## Итоговая рекомендация

Строить лучше не “web Unity на TypeScript”, а **agent-native game runtime**:

- TypeScript-first.
- Text-first.
- Schema-first.
- Pragmatic ECS.
- Command-based mutation.
- Three.js as unified renderer.
- Rapier for 2D/3D physics.
- Optional C#/.NET backend for multiplayer.
- Shared protocol schemas for TS client and C# server.
- Playwright/Vitest as обязательная часть engine, а не “потом”.
- Inspector as debug/edit overlay, не главный источник правды.
- Shaders as typed text assets.

Если коротко: **ECS для мира, MVVM для UI/editor, commands для изменений, functional core для тестов, C# backend для authoritative multiplayer**. Это даст агенту хорошие рельсы и сохранит движок легким.

## Источники

- [Three.js docs](https://threejs.org/docs/) - renderer, scenes, loaders, shaders, WebGL/WebGPU-related APIs.
- [Rapier JavaScript rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies) - rigid bodies, colliders, body types.
- [Rapier JavaScript character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/) - built-in character controller.
- [Vite HMR API](https://vite.dev/guide/api-hmr) - `import.meta.hot` and manual HMR.
- [Playwright screenshots](https://playwright.dev/docs/next/screenshots) - screenshot API for browser automation.
- [Playwright visual comparisons](https://playwright.dev/docs/next/test-snapshots) - screenshot comparison caveats.
- [TypeScript strict option](https://www.typescriptlang.org/tsconfig/strict.html) - strict checking baseline.
- [Vitest features](https://main.vitest.dev/guide/features.html) - TypeScript support and test runner features.
- [Zod](https://zod.dev/) - TypeScript-first schema validation.
- [Ajv TypeScript guide](https://ajv.js.org/guide/typescript.html) - JSON Schema validation with TypeScript support.
- [Microsoft Learn: Blazor WebAssembly AOT](https://learn.microsoft.com/en-us/aspnet/core/blazor/webassembly-build-tools-and-aot) - .NET WASM AOT tradeoffs.
- [Microsoft Learn: JS import/export interop for WebAssembly Browser App](https://learn.microsoft.com/en-us/aspnet/core/client-side/dotnet-interop/wasm-browser-app) - .NET and JavaScript interop.
- [Microsoft Learn: ASP.NET Core SignalR overview](https://learn.microsoft.com/en-us/aspnet/core/signalr/introduction) - realtime apps, hubs, WebSockets/SSE/Long Polling transports.
- [Microsoft Learn: WebSockets support in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/websockets) - low-level WebSocket support for game apps.
- [Microsoft Learn: gRPC-Web in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/grpc/grpcweb) - browser-compatible gRPC-Web and limitations.
- [Microsoft Learn: .NET Aspire documentation](https://learn.microsoft.com/en-us/dotnet/aspire) - distributed app tooling, observability and deployment.
