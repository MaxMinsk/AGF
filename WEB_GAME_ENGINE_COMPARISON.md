# Разбор популярных web-игровых движков

Дата анализа: 2026-05-13

Фокус этого сравнения: не “какой движок вообще лучший”, а что можно забрать для легкого web-движка, который должен быть удобен ИИ-агентам. Поэтому я смотрю на стек, формат проекта, 2D/3D, шейдеры, тестируемость, editor-first vs code-first и примеры игр/демо.

## Сводная таблица

| Движок | Стек | 2D | 3D | Шейдеры | Workflow | Агентская пригодность |
| --- | --- | --- | --- | --- | --- | --- |
| Three.js | JS/TS, WebGL/WebGPU APIs | Можно, но руками | Да | Да, GLSL/ShaderMaterial | Code-first library | Отличная база для своего движка |
| Babylon.js | JS/TS, WebGL/WebGPU | Есть sprites/GUI/2D layers | Да | Да, Node Material, shader materials | Code-first + playground/tools | Мощно, но API крупнее |
| PlayCanvas | JS/TS, ECS, WebGL2/WebGPU | Можно | Да | Да | Engine + web editor | Хороший образец ECS/tooling |
| Phaser | JS/TS, WebGL/Canvas | Да | Ограниченно/не цель | Pipeline/effects, но 2D-first | Code-first 2D framework | Отлично для 2D, не для общего 3D |
| PixiJS | JS/TS, WebGL/WebGPU renderer | Да | Нет | Да, filters/shaders | Renderer library | Хороший 2D renderer adapter |
| Excalibur.js | TypeScript, Canvas/Web APIs | Да | Нет | Ограниченно | Code-first 2D engine | Очень agent-friendly для 2D |
| Cocos Creator | TS/JS, editor, component model | Да | Да | Да | Editor-first | Много готового, но тяжеловато |
| Godot Web | GDScript/C#, WASM/WebGL2 | Да | Да | Да | Editor-first | Отличный движок, но не text-first |
| Unity Web | C#, WebGL/WebGPU path | Да | Да | Да, с web-ограничениями | Heavy editor-first | Сильно, но против идеи легкости |
| Defold | Lua, editor, HTML5 export | Да | Ограниченно | Да | Editor + code | Легкий, но Lua и не web-native TS |
| Wonderland Engine | JS/TS, WASM runtime, WebXR | Ограниченно | Да | Да | Editor + code | Супер для WebXR, уже niche |
| Construct 3 / GDevelop | Visual/no-code + JS | Да | Частично | Effects | Editor-first | Для агента хуже, потому что не code-first |

## Three.js

### Стек

- JavaScript/TypeScript ecosystem.
- WebGLRenderer, WebGPURenderer-related APIs, cameras, scene graph, loaders, materials.
- GLTFLoader для glTF/GLB.
- ShaderMaterial/RawShaderMaterial для custom GLSL.

### Функционал

Three.js - это не игровой движок, а 3D rendering library. Он дает:

- scene graph;
- cameras/lights/materials/meshes;
- loaders для популярных 3D форматов;
- controls и helpers;
- shader/postprocessing ecosystem;
- WebXR support.

Чего нет из коробки:

- gameplay ECS;
- scene/prefab format под игры;
- physics;
- input actions;
- save/load state;
- полноценный editor;
- playtest tooling.

### Примеры

У Three.js много официальных examples: interactive cubes, raycasting, loaders, shaders, postprocessing, WebGPU/WebGL demos. В production он часто используется для интерактивных 3D-сайтов, configurators, visualizers и кастомных web-игр.

### Что забрать

Three.js - лучший кандидат как renderer для нашего движка. Он не тащит готовую архитектуру, поэтому можно построить text-first ECS поверх него.

### Риски

- Много низкоуровневых решений придется принять самим.
- Без своих правил проект быстро станет “куча объектов Three.js и скриптов”.
- 2D нужно проектировать отдельно.

## Babylon.js

### Стек

- JavaScript/TypeScript.
- WebGL/WebGPU support.
- Сильный built-in engine layer.
- Physics integration, включая Havok for the web.
- Node Material, shader/material tooling.

### Функционал

Babylon.js ближе к полноценному движку:

- scene graph;
- PBR materials;
- animation;
- particles;
- GUI;
- audio;
- physics;
- WebXR;
- postprocessing;
- sprites/2D layers;
- playground and tooling.

Официальные спецификации Babylon.js перечисляют WebGL/WebGPU, scene graph, lights, cameras, materials, meshes, animations, audio, actions, physics, sprites/2D layers, GUI и Node Material.

### Примеры игр

На официальной странице Babylon.js Games перечислены:

- Minecraft Classic by Mojang;
- Space Invaders by John Pitchers;
- Temple Run 2 by Imangi Studios;
- Wall Game;
- Sidus Heroes;
- Caterpillar Cowboy;
- Shell Shockers.

### Что забрать

- Идею batteries-included web engine.
- Материалы, GUI, physics, playground как ориентир возможностей.
- Хороший пример того, как web-движок может быть “полным” без Unity.

### Риски

- Для нашего MVP Babylon может быть слишком большим как foundation.
- Если строить agent-first engine поверх Babylon, агенту придется знать много Babylon API.
- Собственный ECS/scene format поверх Babylon возможен, но часть Babylon abstractions начнет конкурировать с нашими.

## PlayCanvas

### Стек

- JavaScript engine with TypeScript definitions.
- WebGL2 + WebGPU backend по официальной странице PlayCanvas Engine.
- Entity Component System.
- Web editor + engine-only usage.
- npm + ES Modules, tree-shakable modules.

### Функционал

PlayCanvas - один из самых близких референсов:

- ECS;
- 3D rendering;
- physics/collision;
- audio;
- input;
- animation;
- assets;
- editor;
- hot reload/editor workflow;
- WebXR;
- mobile web focus.

Официальная документация PlayCanvas прямо описывает ECS: entities as containers, components as data/functionality, systems managing components.

### Примеры игр

Официальные и широко упоминаемые примеры:

- Flappy Bird tutorial/project in PlayCanvas.
- SWOOOP - low-poly flying game, упоминается MDN как известный demo.
- TANX - multiplayer tank game, упоминается MDN.
- Robostorm - официальный games industry page.
- Townstar - listed на PlayCanvas explore page.

### Что забрать

- ECS как core mental model.
- Разделение engine и editor.
- Web-first performance mindset.
- Hot reload code/assets.
- Маленький runtime footprint как продуктовый ориентир.

### Риски

- PlayCanvas как готовая платформа сильно editor/cloud-oriented.
- Если использовать только engine, часть editor benefits пропадет.
- Для text-first agent workflow придется обходить или дублировать project tooling.

## Phaser

### Стек

- JavaScript/TypeScript.
- Custom renderer with WebGL and Canvas.
- Built-in Arcade Physics and Matter.js integration.
- Input manager for keyboard/gamepad/mouse/touch.

### Функционал

Phaser - сильный 2D HTML5 game framework:

- scenes/states;
- sprites;
- animation;
- tilemaps;
- particles;
- tweens;
- physics;
- input;
- sound;
- cameras;
- loader pipeline.

Официальная страница Why Phaser подчеркивает WebGL/Canvas renderer, physics systems и unified input manager.

### Примеры игр

Официальные examples и tutorials включают First Game, physics demos, particles, endless runner examples и showcase/news entries вроде Samme's Showcase. Phaser широко используется для casual/portal/mobile HTML5 игр, но официальная витрина больше ориентирована на examples, tutorials и новости, чем на единый список известных коммерческих игр.

### Что забрать

- Удобство 2D authoring.
- Scene lifecycle для маленьких игр.
- Asset loader ergonomics.
- Input abstraction.
- Arcade physics как пример простого API поверх физики.

### Риски

- 3D не является основной целью.
- Архитектура Phaser не решает проблему общего 2D+3D движка.
- Agent-first JSON scene/prefab формат все равно придется строить отдельно.

## PixiJS

### Стек

- JavaScript/TypeScript.
- 2D renderer.
- WebGL/WebGPU direction in PixiJS v8.
- Filters/shaders for per-pixel effects.

### Функционал

PixiJS - это renderer, не полный game engine:

- sprites;
- containers;
- textures;
- filters;
- masks;
- text;
- render groups;
- interaction basics.

Официальная документация PixiJS описывает filters as WebGL/WebGPU-only feature для per-pixel effects; filters под капотом используют GLSL для WebGL и WGSL для WebGPU.

### Примеры

PixiJS часто используется в 2D web games, interactive ads, casino/social games, data visuals and rich animated UI. Официальные docs и examples хорошо покрывают graphics primitives, sprites, filters, masks и rendering concepts.

### Что забрать

- Если позже понадобится сильный 2D renderer, PixiJS - лучший adapter-кандидат.
- Хорошая модель filters/shaders для 2D effects.
- Можно вдохновиться container/display tree для 2D layer.

### Риски

- Нет 3D.
- Нет gameplay architecture.
- Два renderer pipeline вместе с Three.js усложнят agent workflow.

## Excalibur.js

### Стек

- TypeScript-first 2D game engine.
- HTML5 Canvas/Web stack.
- Built-in physics.
- Code-first.

### Функционал

Excalibur позиционируется как TypeScript 2D engine for the web:

- actors;
- scenes;
- input;
- collisions/physics;
- sprites;
- camera;
- audio;
- loader;
- tests/examples.

Официальный сайт отдельно подчеркивает TypeScript как familiar to C#, Java and other strongly-typed languages.

### Примеры

У Excalibur есть tutorials, samples collection и Excalibird tutorial. Это скорее developer-friendly 2D engine, чем тяжелая production-платформа с большой витриной blockbuster games.

### Что забрать

- Очень хороший пример “typed web game engine”.
- Developer experience близок к тому, что нужно агенту.
- Может быть источником идей для 2D API.

### Риски

- 2D only.
- Если цель 2D+3D+шейдеры, Excalibur не фундамент, а референс.

## Cocos Creator

### Стек

- TypeScript/JavaScript scripting.
- Component-based, data-driven editor.
- 2D и 3D.
- Web, mobile, desktop, mini-game platforms.
- Graphics backends include WebGL2 and WebGPU-on-WASM areas in docs.

### Функционал

Cocos Creator - полноценный game development solution:

- editor;
- scenes;
- components;
- animation;
- physics examples;
- materials/shaders;
- 2D/3D rendering;
- build/publish pipeline;
- cross-platform deployment.

Официальное intro описывает Cocos Creator как content creation-focused, scripted, component-based and data-driven tool.

### Примеры

Официальные examples/tutorials включают:

- One Step, Two Steps;
- Material Examples;
- Render Pipeline Usage Demo;
- Physics examples;
- Taxi Game 3D;
- Marionette Animation Examples.

Cocos также часто встречается в mobile/casual games ecosystem, особенно в Азии.

### Что забрать

- Component/data-driven authoring.
- Material examples and render pipeline examples.
- Cross-platform packaging ideas.

### Риски

- Editor-first workflow.
- Project structure тяжелее, чем хочется для агента.
- Собрать “микро-движок” вокруг Cocos сложнее, чем вокруг Three.js.

## Godot Web

### Стек

- C++ engine.
- GDScript, C#, C++/GDExtension in native contexts.
- Web export через WebAssembly/WebGL2.
- В stable docs есть важное ограничение: для C# на web platforms использовать Godot 3.

### Функционал

Godot - полноценный 2D/3D engine:

- scene/node architecture;
- editor;
- animation;
- physics;
- shaders;
- UI;
- tilemaps;
- navigation;
- audio;
- export templates.

### Примеры

Godot имеет официальные demos/templates и огромное количество open-source indie examples. Для web он может экспортировать HTML5/WebAssembly builds, если browser поддерживает нужные технологии.

### Что забрать

- Node/scene mental model очень понятен.
- Сильная 2D architecture.
- Inspector/editor UX как источник идей.
- Текстовые `.tscn` сцены интересны как пример diff-friendly editor format.

### Риски

- Все равно editor-first.
- Web export тяжелее обычного TS сайта.
- C# web support в Godot 4 остается проблемной точкой по официальной web export странице.
- Агентам можно редактировать `.tscn`, но это не так прозрачно, как собственный JSON schema.

## Unity Web

### Стек

- C#.
- Heavy editor.
- Web build target historically через WebGL; WebGPU appears as experimental in newer Unity docs.
- Большой runtime/build pipeline.

### Функционал

Unity дает почти все:

- 2D/3D;
- physics;
- animation;
- shaders/materials;
- UI;
- asset pipeline;
- editor;
- packages;
- profiler;
- платформы.

### Примеры

Unity WebGL/Web builds используются для demos, web portals, playable ads, education, visualizations и некоторых browser games. Но сильная сторона Unity - cross-platform native/mobile/desktop, а web build часто требует оптимизации размера и памяти.

### Что забрать

- Component authoring familiarity.
- Inspector UX.
- Prefabs.
- Scene hierarchy.
- Play mode and profiling ideas.

### Риски

- Противоречит цели “идеально легкий”.
- Editor-first и binary-ish asset workflow хуже для агента.
- Build times and bundle size.
- Web shader/platform limitations.
- Автоматизировать Unity можно, но это не так естественно, как редактировать TS/JSON и запускать headless браузер.

## Defold

### Стек

- Lua scripting.
- Native editor and build pipeline.
- HTML5 export.
- 2D-first engine with some 3D capabilities.
- Small runtime philosophy.

### Функционал

Defold интересен как легкий production-oriented движок:

- collections/game objects/components;
- sprites, tilemaps, particles;
- physics;
- GUI;
- sound;
- native extensions;
- HTML5 builds;
- multi-platform export.

Официальная документация по HTML5 export описывает web bundle, настройки HTML5-секции проекта, gamepad considerations и ограничения вокруг canvas styling.

### Примеры

Defold используется для 2D/casual/mobile games и HTML5 exports. У него есть official manuals, examples, community showcases и game jam projects, но web-first identity слабее, чем у Phaser/PlayCanvas/Babylon.

### Что забрать

- Маленький runtime mindset.
- Code-first scripting поверх editor-managed assets.
- Хороший пример компактного движка без гигантского toolchain.

### Риски

- Lua вместо TypeScript, меньше статических гарантий без дополнительных слоев.
- Editor/project model все равно не так прозрачен для агента, как свой JSON schema.
- 3D не является такой же сильной стороной, как у Three/Babylon/PlayCanvas.

## Wonderland Engine

### Стек

- JavaScript/TypeScript components.
- WebAssembly-based runtime.
- Desktop editor.
- WebXR-first focus.
- Custom shaders.

### Функционал

Wonderland Engine ориентирован на performant web 3D, VR и AR:

- 3D scene editor;
- JS/TS components;
- WASM runtime;
- WebXR;
- custom shaders;
- physics access;
- optimized rendering.

Официальные docs называют его lightweight web-focused graphics engine and web-based 3D engine for 3D, VR and AR.

### Примеры

Витрина Wonderland больше про WebXR, immersive experiences и performant 3D demos, чем про традиционные 2D/3D игры.

### Что забрать

- Lightweight runtime mindset.
- WebXR pipeline.
- JS/TS components over WASM runtime.

### Риски

- Niche: WebXR/3D-first.
- Editor-first.
- 2D не главная цель.
- Меньше подходит как основа универсального agent-first web game engine.

## Construct 3 и GDevelop

### Стек

- Visual/no-code editor-first workflow.
- JavaScript runtime/extensions.
- Web export.
- 2D-first, с частичной/развивающейся 3D поддержкой.

### Функционал

Оба инструмента сильны для быстрого прототипирования без глубокого программирования:

- visual events;
- behaviors;
- asset management;
- export;
- templates;
- UI для новичков.

### Примеры

У них много community games, templates, playable prototypes and web exports. Они сильны как доступные инструменты для людей без кода.

### Что забрать

- Event sheet как пример declarative behavior.
- Behaviors as reusable gameplay modules.
- Быстрый onboarding.

### Риски

- Для агента visual/no-code слой часто хуже, чем текст.
- Сложнее сделать precise code review.
- Автоматические изменения в editor model менее прозрачны.

## Вывод для нашего движка

Лучший путь - не брать готовый engine как foundation, а собрать маленький слой поверх proven libraries:

- **Three.js** для 3D и базового 2D renderer layer.
- **Rapier** для 2D/3D physics.
- **Vite** для dev/HMR.
- **TypeScript** для gameplay и engine core.
- **Zod/Ajv/JSON Schema** для scene/prefab/material validation.
- **Vitest + Playwright** для agent-visible tests.

Что стоит украсть идеологически:

- У PlayCanvas: ECS, web-first runtime, hot reload, small footprint.
- У Unity: prefabs, inspector, play mode, component familiarity.
- У Godot: scene/node clarity and text-friendly scene thinking.
- У Babylon.js: batteries-included feature map and shader/material ambition.
- У Phaser: ergonomic 2D APIs and simple physics/input.
- У PixiJS: 2D batching/filter inspiration.
- У Excalibur: TypeScript-first developer experience.

Чего лучше избежать:

- Большого editor-first ядра.
- Скрытых binary/project formats.
- Слишком широкой API-поверхности на старте.
- Смешения двух renderer без крайней необходимости.
- Gameplay logic, привязанной напрямую к Three.js objects.

Практический итог: **наш движок должен быть ближе к “PlayCanvas ECS + Unity prefabs + Godot text scenes + Three.js renderer + Phaser-like 2D ergonomics”, но специально урезанным под агента**.

## Источники

- [Three.js docs](https://threejs.org/docs/) - official API docs, renderers, shaders, loaders.
- [Three.js examples](https://threejs.org/examples/) - official examples gallery.
- [Babylon.js specifications](https://www.babylonjs.com/specifications) - official feature list.
- [Babylon.js games](https://www.babylonjs.com/games) - official games page and examples.
- [PlayCanvas Engine](https://playcanvas.com/products/engine) - official engine page.
- [PlayCanvas ECS docs](https://developer.playcanvas.com/user-manual/ecs/) - official ECS explanation.
- [PlayCanvas Flappy Bird tutorial](https://developer.playcanvas.com/tutorials/flappy-bird/) - official tutorial/project.
- [MDN PlayCanvas guide](https://developer.mozilla.org/en-US/docs/Games/Techniques/3D_on_the_web/Building_up_a_basic_demo_with_PlayCanvas) - overview and demo references.
- [Phaser: Why Phaser](https://phaser.io/why-phaser) - official feature overview.
- [Phaser physics docs](https://docs.phaser.io/phaser/concepts/physics) - official physics docs.
- [PixiJS scene objects docs](https://pixijs.com/8.x/guides/components/scene-objects) - official filters/shaders notes.
- [Excalibur.js docs](https://excaliburjs.com/docs/) - official TypeScript 2D engine docs.
- [Cocos Creator introduction](https://docs.cocos.com/creator/manual/en/getting-started/introduction/) - official overview.
- [Cocos Creator examples and tutorials](https://docs.cocos.com/creator/3.8/manual/en/cases-and-tutorials/) - official examples.
- [Godot web export docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) - official web export limitations.
- [Unity WebGPU docs](https://docs.unity.cn/6000.1/Documentation/Manual/WebGPU.html) - official experimental WebGPU page.
- [Wonderland Engine docs](https://wonderlandengine.com/documentation/) - official docs.
- [Wonderland Engine features](https://wonderlandengine.com/about/features/) - official feature overview.
- [Construct 3 features](https://www.construct.net/en/make-games/new-features) - official feature page.
- [Defold HTML5 docs](https://defold.com/manuals/html5/) - official HTML5 export docs.
