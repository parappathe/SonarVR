# SonarVR

Sonar: caça de submarinos em VR para o Meta Quest 3 no navegador (WebXR), sem instalar nada. Numa sala de
sonar de navio (painéis com telas de varredura verdes, lâmpadas âmbar, canos no teto), um aquário de vidro
6x6x4 fica na sua frente, sobre um pedestal; dá para pegar e girar com a mão. Cada lado tem 2 submarinos
escondidos. Você move em silêncio, dá ping (o eco toca em áudio 3D vindo da direção real do inimigo dentro
do aquário, mas entrega o seu bloco) ou dispara torpedos. Partida contra 3 capitães com estilos diferentes
e 10 desafios com 3 estrelas. Também joga no PC com mouse e teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** depois de publicado, abrir no navegador do óculos `https://parappathe.github.io/SonarVR/`
e apertar "Entrar em VR". Use fone ou o som do óculos: o eco vem da direção do submarino. (Publicação é com
o Eduardo: `python publicar.py SonarVR` na pasta `C:\claude code`.)

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8884` (o painel de visualização usa
`.claude/launch.json`). `python serve.py --https` serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Escolher o submarino | Botão "Sub 1"/"Sub 2" da mesa, ou tocar/apontar no submarino | Clicar no botão ou no submarino; Tab troca |
| Mover | Botão "Mover" e tocar/apontar num cubo verde | Botão ou M, depois clicar no cubo verde |
| Ping | Botão "Ping" | Botão ou P |
| Torpedo | Botão "Torpedo"; apontar numa casa da camada verde e gatilho, ou enfiar a mão no aquário e fazer pinça na casa | Botão ou T, camada com 1 a 4 ou a roda do mouse, clicar na casa (Enter também dispara na casa marcada) |
| Esperar (silêncio) | Botão "Esperar" | Botão ou E |
| Trocar a camada (para mirar) | Botões "Subir"/"Descer", manche para cima/baixo, ou A/X | 1 a 4, roda do mouse |
| Girar o aquário | Segurar o aquário (botão lateral ou pinça perto dele) e girar a mão | Arrastar com o botão esquerdo no fundo; R endireita |
| Pausa | B ou Y | Esc (Esc também cancela a ordem escolhida) |
| Câmera | (sua cabeça) | Botão direito arrastando ou A/D/W/S |
| FPS | Menu → FPS | Tecla F |

No VR você fica em pé; o aquário fica na altura do peito, a mesa de comando logo à frente (botões e a
tela verde com as mensagens e os ecos), o placar em cima do aquário.

### Regras

- Aquário de 6x6 casas e 4 camadas (camada 1 em cima). Rochas no fundo bloqueiam. Você começa na metade de
  perto, ele na de lá. Cada lado: 2 submarinos com casco 2 e 8 torpedos.
- **Turnos alternados, uma ordem por lado:** na sua vez você dá UMA ordem a UM dos seus submarinos:
  - **Mover** 1 casa (frente, trás, lados, subir ou descer): silencioso.
  - **Esperar**: silencioso também. Para o outro, mover e esperar são iguais ("ele manobrou ou esperou").
  - **Ping**: volta um eco de cada submarino inimigo: distância em faixa (perto 1-2 casas, médio 3-4,
    longe 5), rumo em 8 direções e se está mais fundo, no mesmo nível ou mais raso. O eco toca em áudio 3D
    da posição real dele. Em troca, ele fica sabendo em que **bloco 2x2x2** está o submarino que pingou (o
    bloco aparece em vermelho quando é ele quem se revela).
  - **Torpedo** numa casa a até 3 casas: acerto direto afunda; casa colada (as 6 vizinhas de face) avaria
    (-1 de casco; 2 avarias afundam). Vale para os seus também. Atirar também revela o seu bloco.
- **Escuta**: no começo da sua vez, se um inimigo está numa casa vizinha (inclusive diagonal) de um
  submarino seu, você ouve a hélice. Tentar entrar na casa dele: não anda e descobre onde ele está.
- Fim: afundar os dois dele. Depois de 40 ordens de cada lado, ganha quem tem mais submarinos, depois mais
  casco.
- Mapas de rochas sorteados: Recife, Cânion, Destroços. Quem começa é sorteado.
- **Mapa de suspeita** (Menu → Mapa): pontinhos âmbar no aquário mostram onde os submarinos dele podem
  estar, maiores onde é mais provável. É a mesma conta que a IA faz, só com o que você sabe (seus ecos, os
  blocos que ele revelou, torpedos que erraram, a escuta).
- Capitães (em `js/ai.js`): **Capitão Arpão** (caçador: pinga quase todo turno e vai atrás do eco; não usa
  os torpedos que erraram nem o silêncio da escuta), **Comandante Muda** (silenciosa: quase nunca pinga,
  espera você se revelar e atira no bloco; só atira com boa chance), **Almirante Tales** (tático: soma toda
  a informação num mapa de probabilidade, atira quando a chance compensa, evita deixar os dois submarinos
  colados e foge quando foi avariado).
- **A IA nunca vê a posição real dos seus submarinos:** ela recebe só `viewFor(st, lado)` (os próprios
  submarinos, as rochas, o registro sem a parte particular do outro). O teste confere com os seus em outro
  lugar e com uma armadilha que explode se alguém ler a posição.
- Desafios (em `js/challenges.js`): afundar os submarinos do Capitão Fixo, que segue uma regra escrita
  (parado, patrulha numa linha, sobe e desce, responde atirando no bloco que você revelou), com poucas
  ordens. Estrelas pelo número de ordens suas até afundar todos. 1 Primeiro ping, 2 Dois parados,
  3 Patrulha, 4 Atrás das rochas, 5 Ele responde, 6 Poucos torpedos, 7 Mergulhador, 8 Cerco, 9 Dupla,
  10 Caçada final.
- Progresso salvo no navegador (localStorage, chave `sonarvr.v1`).

## Como testar

- `npm test` (ou `node tests/run.js`): aquário, rochas, começo nas metades certas; ordens (6 direções,
  rocha e fundo bloqueiam, alcance do torpedo, mover e esperar iguais para o outro, ping com ecos certos e
  bloco revelado, faixas e rumos do eco, torpedo direto afunda e colado avaria, diagonal não pega, fogo
  amigo, duas avarias afundam, escuta, contato, fim); IA (ordem válida, menos de 100 ms, **não trapaceia**:
  mesma ordem com os seus em outro lugar e armadilha na posição, a crença põe quem pingou no bloco revelado,
  a Muda atira no bloco entregue, o Arpão pinga mais que a Muda); IA contra IA em 60 partidas por dupla
  (Tales ganha mais do que perde dos outros dois; mostra os placares); robô (o Tales do seu lado, sem
  espiar) tira 3 estrelas nos 10 desafios e atirar a esmo não dá 3; fumaça do `main.js` (navegador e WebGL
  de mentira: botão Ping, um eco 3D por inimigo saindo da posição real dele, mensagens, mapa de suspeita,
  arrastar gira o aquário, R endireita, Mover e cubo verde, T + camada + clique dispara; controle de VR de
  mentira segura e gira o aquário e toca o botão Ping; robô termina a partida; os 10 desafios com 3 estrelas
  dentro do jogo; `dev.win()`, `dev.cheat()`, pausa). Termina com "Tudo certo"; sai com código 1 se algo
  falhar (ou passar de 200 s). Não toca som.
- O teste de fumaça usa `module.registerHooks` do Node (22.15 ou mais novo).
- No navegador (console): `dev.autoplay = true`, `dev.advance(5)`, `dev.state()` (fase, ordens, torpedos,
  seus submarinos, ação, camada, giro, último eco, mensagens), `dev.cheat()` (onde estão os dele),
  `dev.loadLevel(3)`, `dev.startMatch(2)`, `dev.win()`, `dev.screenOf('ping' | { ghost: k } | { cell } | { sub: id })`,
  `dev.resetSave()`. `window.sonar` tem `st`, `heat`, `sfx`, `world`, `shell`, `camera`, `renderer`.
- Para testar no navegador sem som: não clicar nem apertar teclas na página (isso liga o áudio); usar o
  `window.dev`.
- **Só dá para testar no óculos:** girar o aquário com a mão, pinça dentro do aquário, alcance dos botões,
  direção do eco no fone, leitura dos submarinos pequenos, FPS.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar e dica do PC |
| `js/rules.js` | Aquário, rochas, ecos (`echoOf`), ordens (`applyOrder`, `legalOrders`), escuta, `viewFor`. Sem navegador |
| `js/ai.js` | Capitães, mapa de probabilidade (`beliefFrom`), perigo de estar revelado, `chooseOrder`/`decide`, `playGame`. Sem navegador |
| `js/challenges.js` | Os 10 desafios, ordens do Capitão Fixo (`oppOrder`), robô (`solveChallenge`). Sem navegador |
| `js/shell.js` | Casca: render, câmera, VR, mouse/teclado, painel, placas, FPS, laço (igual ao dos outros jogos) |
| `js/main.js` | O jogo: vez, ordens pelos botões, toque e raio, girar o aquário, animações (onda do ping, torpedo, explosão, afundar), mapa de suspeita, menus, HUD, `dev` |
| `js/scene.js` | Sala de sonar, telas de varredura animadas, pedestal, mesa com botões e tela de mensagens, aquário (moldura, vidro, camadas, rochas), submarinos, marcas (suspeita, cubos de mover, alcance e mira do torpedo, blocos revelados), efeitos |
| `js/visual3d.js`, `js/materiais3d.js` | Luz, caixa chanfrada, halo; metal e pedra em código (da skill dudu) |
| `js/ui.js`, `js/audio.js`, `js/save.js` | Painel/placas; sons (ping, eco 3D com PannerNode e ouvinte na cabeça, torpedo, explosão, hélice da escuta, alarme, bolhas, zumbido da sala); progresso |
| `tests/run.js`, `tests/smoke.js`, `tests/three-stub.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8884, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |
| `Divulgacao/` | Print do jogo (fora do git) |

Aquário centrado em (0; 1,24; -0,44), casa de 7 cm. Mesa de comando em z = 0 (tampo a 0,93 m inclinado).
Você fica em (0; 0,4).

## Regras e convenções do projeto

- `rules.js`, `ai.js` e `challenges.js` não usam navegador nem Three.js.
- A IA só recebe `viewFor(st, lado)`; nunca ler `st.subs` do outro lado. O teste "não trapaceia" confere.
- O mapa de suspeita do jogador usa `beliefFrom(viewFor(st, PLAYER))`: nunca a posição real.
- Mexeu em regras, IA ou desafios: rodar `npm test`. As metas dos desafios saem do robô (a 3ª estrela é o
  número de ordens que ele levou).
- Testes nunca tocam som.

## Decisões

- **Uma ordem por lado (para um submarino), não uma por submarino:** cada ordem pesa (pingar entrega você,
  atirar também), o turno do outro vem rápido e dá tempo de ouvir o eco e pensar; com uma ordem por
  submarino um lado podia pingar com um e atirar com o outro no mesmo turno, e a partida acabava em 2 ou 3
  rodadas.
- Eco em faixas (perto/médio/longe) e 8 rumos: com a distância exata um ping só já achava o submarino.
- Torpedo avaria só nas 6 casas de face: com as 26 vizinhas, atirar às cegas compensava logo no começo.
- Direção de arte: sala de sonar de navio, aço pintado verde-acinzentado #5d7c76 (60%), telas e linhas
  verde-sonar #5fe08a (30%), destaque âmbar #ffb347 (mapa de suspeita, lâmpadas) e vermelho #ff4a3a só para
  perigo (bloco revelado dele, mira do torpedo). Luz: lâmpada quente âmbar de cima e de trás, preenchimento
  verde das telas. Meia-luz, mas clara o bastante para ler (luminância medida 36).
- Capitães por dificuldade: Arpão (fácil de achar, mas perigoso), Muda (média), Tales (difícil). Medido no
  teste: Tales 34 x 26 Arpão, Tales 39 x 21 Muda, Arpão 30 x 30 Muda (em 60). O Arpão e a Muda usam um mapa
  de probabilidade mais pobre (ignoram os torpedos que erraram; o Arpão ignora também o silêncio da escuta).
- Sem sombra de luz (Quest a 72 Hz); cerca de 60 chamadas de desenho.
- Porta do servidor local 8884.

## Pendências / problemas conhecidos

- Falta testar no Quest: girar o aquário com a mão, pinça dentro do aquário para mirar, alcance dos botões
  da mesa, direção do eco 3D no fone, leitura dos submarinos (5,6 cm), FPS.
- Partidas curtas (cerca de 10 a 16 ordens no total entre IAs); contra gente só jogando para saber se o
  ritmo está bom.
- A vantagem do Tales sobre o Arpão é pequena (34 x 26).
