"use client";

import { Loader2, Maximize2, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { acabamentoDaPeca, type Estado3d } from "@/lib/configurador/modelo3d";

// Visualizador do modelo 3D do produto. Carrega UM arquivo com todas as peças e
// obedece ao `Estado3d`: apaga a peça que a escolha não pede e troca o material
// das peças pintáveis. Trocar de opção não recarrega nada — por isso a resposta
// é imediata.
//
// Este componente é pesado (three.js) e só entra na página pelo `next/dynamic`
// do `PreviewProduto`, com `ssr: false`: sem WebGL no servidor e sem custo para
// quem nunca abre o configurador.
//
// O React não toca em nada da cena: o efeito de montagem devolve um punhado de
// COMANDOS e é só isso que os outros efeitos e os botões chamam. Mexer nos
// objetos do three direto do render é o caminho curto para cena e tela saírem
// de sincronia.

// Contrato com `scripts/step-para-glb.mjs`: nó de peça e material configurável.
const PREFIXO_PECA = "peca_";
const MATERIAL_CONFIGURAVEL = "acab_pintado";

// Inox polido. É o único material que o front cria: o resto da aparência vem do
// CAD, mas este muda com a escolha do vendedor e por isso mora aqui.
const INOX = { cor: 0xdfe3e8, metalico: 1, rugosidade: 0.24 };

// De onde a câmera olha (à direita, um pouco acima e à frente) e quanta folga
// sobra em volta do produto.
const DIRECAO_CAMERA = new THREE.Vector3(0.9, 0.5, 1);
const FOLGA = 1.12;

interface Cena {
  aplicar: (estado: Estado3d) => void;
  enquadrar: () => void;
  permitirZoom: (permitido: boolean) => void;
  // Move a tela do WebGL para outro container. É o que permite a mesma cena
  // (mesmo contexto, mesmo modelo carregado) aparecer no painel e, ao ampliar,
  // dentro do portal — sem recarregar nada.
  anexar: (container: HTMLElement | null) => void;
}

interface Visualizador3DProps {
  arquivo: string;
  estado: Estado3d;
  // Avisa o formulário quando o 3D não abre (sem WebGL, arquivo fora do ar),
  // para a tela voltar a mostrar a foto em vez de um retângulo vazio.
  onFalha?: () => void;
}

export default function Visualizador3D({ arquivo, estado, onFalha }: Visualizador3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cenaRef = useRef<Cena | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [ampliado, setAmpliado] = useState(false);

  // Guardado por referência, e não usado como dependência: um `onFalha` recriado
  // no render do pai remontaria a cena WebGL inteira a cada tecla digitada.
  const onFalhaRef = useRef(onFalha);
  useEffect(() => {
    onFalhaRef.current = onFalha;
  }, [onFalha]);

  // Monta a cena uma vez por arquivo. Tudo que é criado aqui é destruído no
  // retorno: WebGL não tem coletor de lixo, e contexto vazado trava a aba
  // depois de algumas navegações.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let vivo = true;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onFalhaRef.current?.();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight || 1);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.domElement.className = "h-full w-full";
    // O OrbitControls bloqueia todo gesto de toque sobre a tela; devolvemos o
    // arrasto vertical ao navegador para a página continuar rolando no celular
    // (arrastar de lado gira o produto, arrastar para baixo rola a página).
    renderer.domElement.style.touchAction = "pan-y";
    container.appendChild(renderer.domElement);

    const cena = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      35,
      container.clientWidth / (container.clientHeight || 1),
      0.05,
      50,
    );

    // Sem mapa de ambiente, inox e cromado ficariam pretos: metal só tem cor
    // quando há o que refletir. A "sala" procedural do three faz esse papel sem
    // baixar textura nenhuma.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    cena.environment = ambiente;
    pmrem.dispose();

    const luz = new THREE.DirectionalLight(0xffffff, 1.6);
    luz.position.set(2, 3, 2.5);
    cena.add(luz);
    cena.add(new THREE.AmbientLight(0xffffff, 0.35));

    const controles = new OrbitControls(camera, renderer.domElement);
    controles.enableDamping = true;
    controles.enablePan = false;
    // A roda do mouse só amplia no modo ampliado: no painel lateral ela precisa
    // continuar rolando a página, senão o vendedor "prende" o scroll no 3D.
    controles.enableZoom = false;
    // Giro livre nos dois eixos, como em qualquer visualizador de CAD: dá para
    // olhar o carro por baixo (rodízios, base) e por cima (tampo).

    let precisaDesenhar = true;
    let animacao = requestAnimationFrame(function laco() {
      animacao = requestAnimationFrame(laco);
      if (controles.update() || precisaDesenhar) {
        renderer.render(cena, camera);
        precisaDesenhar = false;
      }
    });

    function ajustarAo(alvo: HTMLElement) {
      const largura = alvo.clientWidth;
      const altura = alvo.clientHeight;
      if (largura === 0 || altura === 0) return;
      renderer.setSize(largura, altura);
      camera.aspect = largura / altura;
      camera.updateProjectionMatrix();
      precisaDesenhar = true;
    }

    // Observa o container ATUAL (ele muda quando a prévia é ampliada), por isso
    // o tamanho vem do alvo do evento e não de uma variável fixa.
    const observador = new ResizeObserver((entradas) => {
      const alvo = entradas[0]?.target;
      if (alvo instanceof HTMLElement) ajustarAo(alvo);
    });
    observador.observe(container);

    const materialInox = new THREE.MeshStandardMaterial({
      color: new THREE.Color(INOX.cor).convertSRGBToLinear(),
      metalness: INOX.metalico,
      roughness: INOX.rugosidade,
    });

    const carregador = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    carregador.load(
      arquivo,
      (glb) => {
        if (!vivo) return;
        const modelo = glb.scene;

        // Índice das peças: o nó que se acende e apaga e, dentro dele, as
        // malhas que trocam de acabamento.
        const pecas = new Map<string, { no: THREE.Object3D; pintaveis: THREE.Mesh[] }>();
        for (const no of modelo.children) {
          if (!no.name.startsWith(PREFIXO_PECA)) continue;
          const pintaveis: THREE.Mesh[] = [];
          no.traverse((filho) => {
            const malha = filho as THREE.Mesh;
            if (malha.isMesh && (malha.material as THREE.Material).name === MATERIAL_CONFIGURAVEL) {
              malha.userData.materialCad = malha.material;
              pintaveis.push(malha);
            }
          });
          pecas.set(no.name.slice(PREFIXO_PECA.length), { no, pintaveis });
        }

        cena.add(modelo);
        cena.add(sombraDeContato(modelo));

        const esfera = new THREE.Box3()
          .setFromObject(modelo)
          .getBoundingSphere(new THREE.Sphere());

        function enquadrar() {
          // Distância em que o produto inteiro cabe na MENOR abertura da tela (a
          // vertical num painel largo, a horizontal num painel estreito).
          const fovVertical = (camera.fov * Math.PI) / 180;
          const fovHorizontal = 2 * Math.atan(Math.tan(fovVertical / 2) * camera.aspect);
          const distancia =
            (esfera.radius / Math.sin(Math.min(fovVertical, fovHorizontal) / 2)) * FOLGA;
          camera.position
            .copy(esfera.center)
            .addScaledVector(DIRECAO_CAMERA.clone().normalize(), distancia);
          controles.target.copy(esfera.center);
          controles.minDistance = esfera.radius * 1.05;
          controles.maxDistance = distancia * 1.6;
          controles.update();
          precisaDesenhar = true;
        }
        enquadrar();

        cenaRef.current = {
          enquadrar,
          anexar(alvo) {
            if (!alvo || renderer.domElement.parentElement === alvo) return;
            observador.disconnect();
            alvo.appendChild(renderer.domElement);
            observador.observe(alvo);
            ajustarAo(alvo);
          },
          permitirZoom(permitido) {
            controles.enableZoom = permitido;
            renderer.domElement.style.touchAction = permitido ? "none" : "pan-y";
          },
          aplicar(atual) {
            for (const [chave, { no, pintaveis }] of pecas) {
              no.visible = !atual.ocultas.has(chave);
              const inox = acabamentoDaPeca(atual, chave) === "inox";
              for (const malha of pintaveis) {
                malha.material = inox
                  ? materialInox
                  : (malha.userData.materialCad as THREE.Material);
              }
            }
            precisaDesenhar = true;
          },
        };
        setCarregado(true);
      },
      (evento) => {
        if (vivo && evento.total > 0) {
          setProgresso(Math.round((evento.loaded / evento.total) * 100));
        }
      },
      () => {
        if (vivo) onFalhaRef.current?.();
      },
    );

    return () => {
      vivo = false;
      cancelAnimationFrame(animacao);
      observador.disconnect();
      controles.dispose();
      cena.traverse((objeto) => {
        const malha = objeto as THREE.Mesh;
        if (!malha.isMesh) return;
        malha.geometry.dispose();
        const materiais = Array.isArray(malha.material) ? malha.material : [malha.material];
        // O material do CAD pode estar guardado (a peça está em inox agora):
        // sem ele na conta, sobra material vivo depois de sair da página.
        for (const material of [...materiais, malha.userData.materialCad]) {
          (material as THREE.Material | undefined)?.dispose();
        }
      });
      materialInox.dispose();
      ambiente.dispose();
      renderer.domElement.remove();
      renderer.dispose();
      cenaRef.current = null;
      setCarregado(false);
    };
  }, [arquivo]);

  // Aplica as escolhas. Roda a cada mudança de estado e também logo depois do
  // carregamento — por isso `carregado` é dependência.
  useEffect(() => {
    cenaRef.current?.aplicar(estado);
  }, [estado, carregado]);

  // Ampliar não recarrega a cena: a mesma tela do WebGL é levada para o
  // container do portal. A roda do mouse só amplia aqui dentro.
  useEffect(() => {
    cenaRef.current?.anexar(containerRef.current);
    cenaRef.current?.permitirZoom(ampliado);
    if (!ampliado) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAmpliado(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ampliado, carregado]);

  const botao =
    "pointer-events-auto flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur transition-colors hover:text-card-foreground";

  const conteudo = (
    <div
      className={
        ampliado
          ? "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          : "relative flex h-full flex-col"
      }
    >
      {/* A tela do WebGL é filha do `containerRef` e NÃO do React: por isso ela
          fica num div só dela, sem irmão que o React possa remover embaixo. */}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {!carregado && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando 3D{progresso > 0 ? ` ${progresso}%` : ""}
          </p>
        )}
      </div>

      <div className="pointer-events-none absolute right-2 top-2 flex gap-1">
        <button
          type="button"
          onClick={() => cenaRef.current?.enquadrar()}
          title="Reenquadrar"
          aria-label="Reenquadrar"
          className={botao}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {ampliado && "Reenquadrar"}
        </button>
        <button
          type="button"
          onClick={() => setAmpliado((valor) => !valor)}
          title={ampliado ? "Fechar" : "Ampliar"}
          aria-label={ampliado ? "Fechar" : "Ampliar"}
          className={botao}
        >
          {ampliado ? <X className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {ampliado && "Fechar"}
        </button>
      </div>
    </div>
  );

  if (!ampliado) return conteudo;

  // Direto no <body>: dentro do painel, qualquer ancestral com transform,
  // filtro ou opacidade viraria a referência do `fixed` e a janela ampliada
  // sairia do lugar — inclusive com o botão de fechar fora da tela.
  return createPortal(
    <div
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) setAmpliado(false);
      }}
      className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 sm:p-6"
    >
      {conteudo}
    </div>,
    document.body,
  );
}

// Sombra de contato: um borrão redondo no chão, do tamanho da base do produto.
// É o que tira a sensação de objeto flutuando, sem o custo de sombra de verdade.
function sombraDeContato(modelo: THREE.Object3D): THREE.Mesh {
  const tela = document.createElement("canvas");
  tela.width = 128;
  tela.height = 128;
  const pincel = tela.getContext("2d")!;
  const gradiente = pincel.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradiente.addColorStop(0, "rgba(0,0,0,0.38)");
  gradiente.addColorStop(0.6, "rgba(0,0,0,0.12)");
  gradiente.addColorStop(1, "rgba(0,0,0,0)");
  pincel.fillStyle = gradiente;
  pincel.fillRect(0, 0, 128, 128);

  const tamanho = new THREE.Box3().setFromObject(modelo).getSize(new THREE.Vector3());
  const lado = Math.max(tamanho.x, tamanho.z) * 1.5;
  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(lado, lado),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(tela),
      transparent: true,
      depthWrite: false,
    }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.002;
  return sombra;
}
