import { Canvas } from '@react-three/fiber'
import { ContactShadows, Edges, OrbitControls, RoundedBox } from '@react-three/drei'
import {
  ArrowDown,
  ArrowRight,
  Box,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Code2,
  ExternalLink,
  FileText,
  FileUp,
  Layers3,
  Menu,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

type PartKey = 'bracket' | 'flange' | 'housing'
type ViewMode = 'solid' | 'wire' | 'xray'

type Operation = {
  label: string
  short: string
  description: string
  code: string
}

type PartDefinition = {
  key: PartKey
  name: string
  designation: string
  views: number
  dimensions: number
  operations: Operation[]
}

const PARTS: Record<PartKey, PartDefinition> = {
  bracket: {
    key: 'bracket',
    name: 'Опорный кронштейн',
    designation: 'КР.02.014',
    views: 3,
    dimensions: 18,
    operations: [
      { label: 'Исходный лист', short: 'PDF', description: 'Найдены главный вид, вид сверху и разрез', code: '// Вход: 3 согласованных вида, 18 размеров' },
      { label: 'Базовый эскиз', short: 'Sketch', description: 'Замкнут контур основания 120 × 72 мм', code: 'sketch("S1", plane: TOP, profile: baseContour)' },
      { label: 'Выдавливание', short: 'Extrude', description: 'Сформировано основание толщиной 12 мм', code: 'extrude("F1", sketch: "S1", depth: 12 * mm)' },
      { label: 'Отверстия', short: 'Hole', description: 'Добавлены 2 отверстия Ø14 мм', code: 'hole("F2", faces: topFace, diameter: 14 * mm, count: 2)' },
      { label: 'Стойка', short: 'Extrude', description: 'Построена вертикальная стойка с отверстием', code: 'extrude("F3", sketch: "S2", depth: 16 * mm)' },
      { label: 'Скругления', short: 'Fillet', description: 'Скруглены выбранные рёбра, R6 мм', code: 'fillet("F4", edges: makeQuery("F3"), radius: 6 * mm)' },
      { label: 'Проверка B-rep', short: 'Validate', description: 'Геометрия скомпилирована и согласована с видами', code: 'validateBRep("F5", tolerance: 0.10 * mm)' },
    ],
  },
  flange: {
    key: 'flange',
    name: 'Круглый фланец',
    designation: 'ФЛ.01.115',
    views: 2,
    dimensions: 11,
    operations: [
      { label: 'Исходный лист', short: 'PDF', description: 'Найдены главный вид и разрез', code: '// Вход: 2 вида, 11 размеров, ось вращения' },
      { label: 'Контур', short: 'Sketch', description: 'Распознан наружный контур Ø115 мм', code: 'sketch("S1", plane: FRONT, circle: diameter(115 * mm))' },
      { label: 'Толщина', short: 'Extrude', description: 'Сформирован диск толщиной 10 мм', code: 'extrude("F1", sketch: "S1", depth: 10 * mm)' },
      { label: 'Центр', short: 'Hole', description: 'Выполнено центральное отверстие Ø25 мм', code: 'hole("F2", diameter: 25 * mm, through: ALL)' },
      { label: 'Массив', short: 'Pattern', description: 'Созданы 4 отверстия Ø14 на Ø85 мм', code: 'circularPattern("F3", seed: hole14, count: 4, angle: 360 * deg)' },
      { label: 'Фаски', short: 'Chamfer', description: 'Добавлены технологические фаски', code: 'chamfer("F4", edges: outerEdges, width: 1 * mm)' },
      { label: 'Проверка B-rep', short: 'Validate', description: 'Геометрия валидна, размеры согласованы', code: 'validateBRep("F5", projectionCheck: true)' },
    ],
  },
  housing: {
    key: 'housing',
    name: 'Корпус подшипника',
    designation: 'КП.04.208',
    views: 3,
    dimensions: 24,
    operations: [
      { label: 'Исходный лист', short: 'PDF', description: 'Согласованы три проекции и разрез А–А', code: '// Вход: 3 вида, разрез, 24 размера' },
      { label: 'Габарит', short: 'Sketch', description: 'Собран опорный контур корпуса', code: 'sketch("S1", plane: TOP, profile: housingBase)' },
      { label: 'Основание', short: 'Extrude', description: 'Построена базовая форма корпуса', code: 'extrude("F1", sketch: "S1", depth: 48 * mm)' },
      { label: 'Оболочка', short: 'Shell', description: 'Создана полость с толщиной стенки 6 мм', code: 'shell("F2", remove: topFace, thickness: 6 * mm)' },
      { label: 'Посадка', short: 'Hole', description: 'Выполнено посадочное отверстие Ø42 H7', code: 'hole("F3", axis: mainAxis, diameter: 42 * mm, through: ALL)' },
      { label: 'Рёбра', short: 'Pattern', description: 'Добавлены два ребра жёсткости', code: 'mirror("F4", seed: rib, plane: RIGHT)' },
      { label: 'Проверка B-rep', short: 'Validate', description: 'Топология валидна, проекции сопоставлены', code: 'validateBRep("F5", topology: MANIFOLD)' },
    ],
  },
}

const PIPELINE = [
  ['01', 'Подготовка', 'Очистка листа и поиск видов'],
  ['02', 'Интерпретация', 'Контуры, оси, размеры, связи'],
  ['03', 'CAD-программа', 'Параметрическая история FeatureScript'],
  ['04', 'Компиляция', 'Точная граничная B-rep геометрия'],
  ['05', 'Контроль', 'Обратные проекции и допуски'],
]

const OPS = [
  ['Sketch', 'Профиль'], ['Extrude', 'Выдавливание'], ['Revolve', 'Вращение'],
  ['Sweep', 'По траектории'], ['Loft', 'Переход'], ['Fillet', 'Скругление'],
  ['Chamfer', 'Фаска'], ['Shell', 'Оболочка'], ['Hole', 'Отверстие'],
  ['Boolean', 'Булева операция'], ['Pattern', 'Массив'],
]

function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

function scrollToDemo() {
  document.querySelector('#demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function HeroVisual() {
  return (
    <div className="hero-visual" aria-label="Схема преобразования чертежа в 3D-модель">
      <div className="visual-topbar">
        <span>СЕАНС / CADFS-014</span>
        <span className="live-dot"><i /> ГОТОВО К АНАЛИЗУ</span>
      </div>
      <div className="hero-stage">
        <div className="hero-sheet">
          <div className="sheet-label"><span>01</span> ИСХОДНЫЙ ВИД</div>
          <svg viewBox="0 0 320 260" role="img" aria-label="Фрагмент технического чертежа кронштейна">
            <defs>
              <pattern id="hero-grid" width="14" height="14" patternUnits="userSpaceOnUse">
                <path d="M 14 0 L 0 0 0 14" fill="none" stroke="currentColor" strokeWidth="0.35" opacity=".18" />
              </pattern>
            </defs>
            <rect width="320" height="260" fill="url(#hero-grid)" />
            <g className="hero-drawing">
              <path d="M72 176H251V206H72z" />
              <path d="M126 176V81Q126 46 161 46Q196 46 196 81V176" />
              <circle cx="161" cy="91" r="24" />
              <circle cx="161" cy="91" r="8" />
              <circle cx="101" cy="191" r="7" />
              <circle cx="222" cy="191" r="7" />
              <path className="axis" d="M46 191H276M161 26V224" />
              <path className="dim" d="M72 225V240M251 225V240M72 234H251M67 234l8-4v8zM256 234l-8-4v8z" />
              <text x="148" y="252">120</text>
              <path className="dim" d="M218 67L251 42M242 42h42" />
              <text x="246" y="36">Ø42 H7</text>
              <path className="scan" d="M55 138H271" />
            </g>
          </svg>
          <div className="recognition-chip chip-a">Ø42 <Check size={11} /></div>
          <div className="recognition-chip chip-b">R6 <Check size={11} /></div>
        </div>
        <div className="hero-transform">
          <span>FeatureScript</span>
          <div className="pulse-line"><i /><i /><i /></div>
          <ArrowRight size={18} />
        </div>
        <div className="hero-model-card">
          <div className="sheet-label"><span>02</span> B-REP МОДЕЛЬ</div>
          <svg viewBox="0 0 340 280" role="img" aria-label="Изометрическая 3D-модель кронштейна">
            <g className="iso-model">
              <path className="face-top" d="M58 184l160-71 67 38-161 72z" />
              <path className="face-side" d="M58 184v27l67 39v-27z" />
              <path className="face-front" d="M125 223l160-72v27l-160 72z" />
              <path className="face-top" d="M130 174V86l82-37 27 16v88l-27 13V86l-55 25v76z" />
              <path className="face-side" d="M130 86l27 16v85l-27-13z" />
              <ellipse cx="200" cy="105" rx="17" ry="10" transform="rotate(-24 200 105)" />
              <ellipse cx="99" cy="197" rx="10" ry="5" transform="rotate(29 99 197)" />
              <ellipse cx="234" cy="140" rx="10" ry="5" transform="rotate(29 234 140)" />
              <path className="axis-3d" d="M39 230h59M39 230v-47M39 230l-22 10" />
              <text x="101" y="234">X</text><text x="35" y="177">Z</text><text x="9" y="250">Y</text>
            </g>
          </svg>
          <div className="model-status"><ShieldCheck size={15} /> Геометрия валидна</div>
        </div>
      </div>
      <div className="hero-operations">
        {['Sketch', 'Extrude', 'Hole', 'Fillet', 'Validate'].map((op, i) => (
          <span key={op} className={i < 4 ? 'done' : 'current'}><i>{i < 4 ? <Check size={11} /> : '05'}</i>{op}</span>
        ))}
      </div>
    </div>
  )
}

function TechnicalDrawing({ part, activeStep }: { part: PartKey; activeStep: number }) {
  const hot = (step: number) => activeStep === step ? 'draw-active' : activeStep > step ? 'draw-done' : ''

  return (
    <svg className="technical-drawing" viewBox="0 0 720 520" role="img" aria-label={`Чертёж: ${PARTS[part].name}`}>
      <defs>
        <pattern id="paper-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="#7d8e9c" strokeWidth=".45" opacity=".18" />
        </pattern>
        <marker id="dim-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
          <path d="M0 4L8 0L6.5 4L8 8Z" fill="currentColor" />
        </marker>
      </defs>
      <rect width="720" height="520" fill="#f4f3ed" />
      <rect width="720" height="520" fill="url(#paper-grid)" />
      <g className="sheet-frame">
        <path d="M18 18H702V502H18Z" />
        <path d="M488 430H702M488 456H702M564 430V502M645 430V502" />
        <text x="498" y="449">{PARTS[part].designation}</text>
        <text x="498" y="476">{PARTS[part].name}</text>
        <text x="657" y="449">1:1</text>
        <text x="656" y="477">Лист 1</text>
      </g>

      {part === 'bracket' && (
        <g className="drawing-geometry">
          <g className={hot(1)}>
            <path d="M75 307H366V350H75Z" />
            <path d="M98 326H343" className="axis" />
            <circle cx="119" cy="328" r="11" /><circle cx="322" cy="328" r="11" />
          </g>
          <g className={hot(4)}>
            <path d="M160 307V164A61 61 0 01160 164A61 61 0 01282 164V307" />
            <circle cx="221" cy="172" r="34" />
            <circle cx="221" cy="172" r="16" />
            <path d="M176 307l45-40 45 40" />
          </g>
          <g className="axis-lines">
            <path d="M52 328H389M221 87V375" />
          </g>
          <g className={`dimensions ${hot(3)}`}>
            <path d="M75 375V402M366 375V402M75 393H366" markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)" />
            <text x="208" y="388">120</text>
            <path d="M389 307H420M389 350H420M411 307V350" markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)" />
            <text x="422" y="334">12</text>
            <path d="M245 148L300 100H345" markerStart="url(#dim-arrow)" />
            <text x="303" y="92">Ø42 H7</text>
            <path d="M112 317L76 274H42" markerStart="url(#dim-arrow)" />
            <text x="42" y="267">2 отв. Ø14</text>
            <path d="M275 129L311 145" markerStart="url(#dim-arrow)" />
            <text x="316" y="151">R6</text>
          </g>
          <g className="secondary-view">
            <text x="490" y="61">Вид сверху</text>
            <path d="M481 85H648V157H481Z" />
            <path d="M540 85V157M589 85V157" className="hidden" />
            <circle cx="510" cy="121" r="10" /><circle cx="619" cy="121" r="10" />
            <path d="M462 121H667M564 73V169" className="axis" />
          </g>
        </g>
      )}

      {part === 'flange' && (
        <g className="drawing-geometry">
          <g className={hot(1)}>
            <circle cx="245" cy="245" r="145" />
          </g>
          <g className={hot(3)}><circle cx="245" cy="245" r="32" /></g>
          <g className={hot(4)}>
            {[0, 90, 180, 270].map((deg) => {
              const r = 106
              const x = 245 + Math.cos((deg * Math.PI) / 180) * r
              const y = 245 + Math.sin((deg * Math.PI) / 180) * r
              return <circle key={deg} cx={x} cy={y} r="16" />
            })}
            <circle cx="245" cy="245" r="106" className="pitch-circle" />
          </g>
          <g className="axis-lines"><path d="M60 245H430M245 60V430" /></g>
          <g className="dimensions">
            <path d="M141 141L350 350" markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)" />
            <text x="348" y="365">Ø115</text>
            <path d="M245 245L351 245" markerEnd="url(#dim-arrow)" />
            <text x="283" y="236">Ø85±0,25</text>
            <path d="M221 221L194 194" markerStart="url(#dim-arrow)" />
            <text x="139" y="189">Ø25</text>
            <path d="M351 229L402 190H445" markerStart="url(#dim-arrow)" />
            <text x="397" y="181">4 отв. Ø14</text>
          </g>
          <g className="secondary-view">
            <text x="492" y="151">Разрез А–А</text>
            <path d="M487 211H654V239H487Z" />
            <path d="M552 211V239M590 211V239" className="hidden" />
            <path d="M471 225H670" className="axis" />
            <path d="M487 263V288M654 263V288M487 278H654" markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)" />
            <text x="559" y="272">10</text>
          </g>
        </g>
      )}

      {part === 'housing' && (
        <g className="drawing-geometry">
          <g className={hot(1)}><path d="M67 318H416V375H67Z" /></g>
          <g className={hot(2)}>
            <path d="M115 318V206Q115 139 182 139H300Q367 139 367 206V318" />
          </g>
          <g className={hot(3)}>
            <path d="M151 318V211Q151 176 186 176H296Q331 176 331 211V318" className="hidden" />
          </g>
          <g className={hot(4)}><circle cx="241" cy="231" r="58" /><circle cx="241" cy="231" r="39" /></g>
          <g className={hot(5)}><path d="M115 318l52-68v68M367 318l-52-68v68" /></g>
          <circle cx="105" cy="347" r="12" /><circle cx="379" cy="347" r="12" />
          <g className="axis-lines"><path d="M42 347H438M241 92V402" /></g>
          <g className="dimensions">
            <path d="M202 231H280" markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)" />
            <text x="221" y="219">Ø42 H7</text>
            <path d="M67 402V426M416 402V426M67 418H416" markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)" />
            <text x="228" y="412">160</text>
            <path d="M385 318H455M385 375H455M444 318V375" markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)" />
            <text x="454" y="351">18</text>
          </g>
          <g className="secondary-view">
            <text x="513" y="78">Вид сверху</text>
            <path d="M492 104H665V226H492Z" />
            <path d="M530 130H628V200H530Z" className="hidden" />
            <circle cx="516" cy="165" r="9" /><circle cx="641" cy="165" r="9" />
            <path d="M475 165H682M578 89V241" className="axis" />
          </g>
        </g>
      )}
      <g className="sheet-note">
        <text x="42" y="476">Демонстрационный чертёж · размеры в мм</text>
      </g>
    </svg>
  )
}

function roundedRectangleShape(width: number, height: number, radius: number) {
  const x = -width / 2
  const y = -height / 2
  const shape = new THREE.Shape()
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return shape
}

function addCircleHole(shape: THREE.Shape, x: number, y: number, radius: number) {
  const hole = new THREE.Path()
  hole.absarc(x, y, radius, 0, Math.PI * 2, true)
  shape.holes.push(hole)
}

function Material({ mode, color = '#78d99b' }: { mode: ViewMode; color?: string }) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={0.48}
      roughness={0.28}
      wireframe={mode === 'wire'}
      transparent={mode === 'xray'}
      opacity={mode === 'xray' ? 0.38 : 1}
      side={THREE.DoubleSide}
    />
  )
}

function BracketModel({ step, mode }: { step: number; mode: ViewMode }) {
  const baseGeometry = useMemo(() => {
    const shape = roundedRectangleShape(5.2, 3, step >= 5 ? 0.28 : 0.06)
    if (step >= 3) {
      addCircleHole(shape, -1.8, 0, 0.25)
      addCircleHole(shape, 1.8, 0, 0.25)
    }
    return new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: step >= 5, bevelSize: 0.055, bevelThickness: 0.055, bevelSegments: 3 })
  }, [step])

  const plateGeometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-1.45, 0)
    shape.lineTo(-1.45, 2.2)
    if (step >= 5) {
      shape.bezierCurveTo(-1.45, 3.25, -0.72, 3.75, 0, 3.75)
      shape.bezierCurveTo(0.72, 3.75, 1.45, 3.25, 1.45, 2.2)
    } else {
      shape.lineTo(-1.45, 3.4)
      shape.lineTo(1.45, 3.4)
      shape.lineTo(1.45, 2.2)
    }
    shape.lineTo(1.45, 0)
    shape.closePath()
    addCircleHole(shape, 0, 2.45, 0.56)
    return new THREE.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: step >= 5, bevelSize: 0.045, bevelThickness: 0.045, bevelSegments: 3 })
  }, [step])

  return (
    <group position={[0, 0, -0.55]} rotation={[0, 0, 0]}>
      {step >= 1 && (
        <mesh geometry={baseGeometry} position={[0, 0, 0]} castShadow receiveShadow>
          <Material mode={step === 1 ? 'wire' : mode} color={step === 1 ? '#4c86ff' : '#73d99a'} />
          <Edges threshold={20} color="#14251c" />
        </mesh>
      )}
      {step >= 4 && (
        <mesh geometry={plateGeometry} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.17, 0.36]} castShadow receiveShadow>
          <Material mode={mode} color={step === 4 ? '#4c86ff' : '#73d99a'} />
          <Edges threshold={20} color="#14251c" />
        </mesh>
      )}
      {step >= 5 && (
        <>
          <mesh position={[-1.05, -0.03, 0.92]} rotation={[-0.58, 0, 0]} castShadow>
            <boxGeometry args={[0.18, 1.45, 0.18]} />
            <Material mode={mode} color="#63c987" />
            <Edges color="#14251c" />
          </mesh>
          <mesh position={[1.05, -0.03, 0.92]} rotation={[-0.58, 0, 0]} castShadow>
            <boxGeometry args={[0.18, 1.45, 0.18]} />
            <Material mode={mode} color="#63c987" />
            <Edges color="#14251c" />
          </mesh>
        </>
      )}
    </group>
  )
}

function FlangeModel({ step, mode }: { step: number; mode: ViewMode }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.absarc(0, 0, 2.5, 0, Math.PI * 2, false)
    if (step >= 3) addCircleHole(shape, 0, 0, 0.54)
    if (step >= 4) {
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2
        addCircleHole(shape, Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0.26)
      }
    }
    return new THREE.ExtrudeGeometry(shape, { depth: 0.48, bevelEnabled: step >= 5, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 4 })
  }, [step])

  return (
    <group rotation={[0.08, 0, -0.25]} position={[0, 0, 0.2]}>
      {step >= 1 && (
        <mesh geometry={geometry} castShadow receiveShadow>
          <Material mode={step === 1 ? 'wire' : mode} color={step === 4 ? '#4c86ff' : '#73d99a'} />
          <Edges threshold={20} color="#14251c" />
        </mesh>
      )}
    </group>
  )
}

function HousingModel({ step, mode }: { step: number; mode: ViewMode }) {
  return (
    <group position={[0, 0, -0.25]}>
      {step >= 1 && (
        <RoundedBox args={[5.4, 3.2, 0.55]} radius={step >= 6 ? 0.22 : 0.08} smoothness={4} position={[0, 0, 0]} castShadow receiveShadow>
          <Material mode={step === 1 ? 'wire' : mode} color="#73d99a" />
        </RoundedBox>
      )}
      {step >= 2 && (
        <RoundedBox args={[3.8, 2.35, 2.5]} radius={step >= 6 ? 0.3 : 0.08} smoothness={4} position={[0, 0, 1.38]} castShadow>
          <Material mode={mode} color={step === 2 ? '#4c86ff' : '#69d08f'} />
          <Edges threshold={25} color="#14251c" />
        </RoundedBox>
      )}
      {step >= 3 && (
        <RoundedBox args={[2.8, 2.45, 1.65]} radius={0.22} smoothness={4} position={[0, 0, 1.62]}>
          <meshStandardMaterial color="#0b0f12" wireframe={mode === 'wire'} transparent={mode === 'xray'} opacity={mode === 'xray' ? .6 : 1} />
          <Edges threshold={25} color="#3c4b57" />
        </RoundedBox>
      )}
      {step >= 4 && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -1.28, 1.38]}>
          <torusGeometry args={[0.62, 0.19, 24, 64]} />
          <Material mode={mode} color="#4c86ff" />
        </mesh>
      )}
      {step >= 5 && (
        <>
          <mesh position={[-1.72, 0, 1.15]} rotation={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[0.22, 2.4, 1.8]} />
            <Material mode={mode} color="#61c786" />
          </mesh>
          <mesh position={[1.72, 0, 1.15]} rotation={[0, -0.55, 0]} castShadow>
            <boxGeometry args={[0.22, 2.4, 1.8]} />
            <Material mode={mode} color="#61c786" />
          </mesh>
        </>
      )}
    </group>
  )
}

function CadViewport({ part, step, mode, resetKey }: { part: PartKey; step: number; mode: ViewMode; resetKey: number }) {
  return (
    <Canvas key={resetKey} camera={{ position: [7.2, -7.8, 6.5], fov: 38 }} dpr={[1, 1.8]} gl={{ antialias: true }}>
      <color attach="background" args={['#0d1217']} />
      <fog attach="fog" args={['#0d1217', 13, 24]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, -5, 9]} intensity={2.7} color="#ffffff" castShadow />
      <directionalLight position={[-4, 2, 3]} intensity={1.4} color="#3d7dff" />
      <group rotation={[0, 0, 0]}>
        {part === 'bracket' && <BracketModel step={step} mode={mode} />}
        {part === 'flange' && <FlangeModel step={step} mode={mode} />}
        {part === 'housing' && <HousingModel step={step} mode={mode} />}
      </group>
      <gridHelper args={[20, 40, '#405866', '#26333c']} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.61]} />
      <ContactShadows position={[0, 0, -0.58]} opacity={0.35} scale={12} blur={2.8} far={6} />
      <OrbitControls makeDefault target={[0, 0, 1]} minDistance={5} maxDistance={14} enableDamping dampingFactor={0.08} />
    </Canvas>
  )
}

function ProgressRail({ activeStep }: { activeStep: number }) {
  const items = ['Лист', 'Виды', 'Параметры', 'История', 'B-rep', 'Контроль']
  return (
    <div className="progress-rail" aria-label="Ход обработки">
      {items.map((item, index) => {
        const complete = index < Math.min(activeStep, 5)
        const current = index === Math.min(activeStep, 5)
        return (
          <div className={`rail-item ${complete ? 'complete' : ''} ${current ? 'current' : ''}`} key={item}>
            <span>{complete ? <Check size={12} /> : index + 1}</span>
            <em>{item}</em>
          </div>
        )
      })}
    </div>
  )
}

function UploadControl({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className={`upload-control ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) onFile(file)
      }} />
      <FileUp size={18} />
      <span>Перетащите чертёж</span>
      <button type="button" onClick={() => inputRef.current?.click()}>Выбрать файл</button>
    </div>
  )
}

function DemoWorkbench() {
  const [part, setPart] = useState<PartKey>('bracket')
  const [activeStep, setActiveStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState<ViewMode>('solid')
  const [resetKey, setResetKey] = useState(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const definition = PARTS[part]
  const lastStep = definition.operations.length - 1

  useEffect(() => {
    if (!playing) return
    if (activeStep >= lastStep) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => setActiveStep((step) => step + 1), 1050)
    return () => window.clearTimeout(timer)
  }, [playing, activeStep, lastStep])

  const choosePart = (nextPart: PartKey) => {
    setPart(nextPart)
    setActiveStep(0)
    setPlaying(false)
    setFileName(null)
    setResetKey((key) => key + 1)
  }

  const handlePlay = () => {
    if (activeStep >= lastStep) setActiveStep(0)
    setPlaying((value) => !value)
  }

  const handleFile = (file: File) => {
    setFileName(file.name)
    setActiveStep(0)
    setPlaying(true)
  }

  return (
    <div className="workbench">
      <div className="workbench-bar">
        <div className="window-title">
          <span className="window-dots"><i /><i /><i /></span>
          <span>CADFS / RECONSTRUCTION LAB</span>
        </div>
        <div className="part-switcher" role="tablist" aria-label="Примеры деталей">
          {(Object.keys(PARTS) as PartKey[]).map((key) => (
            <button type="button" role="tab" aria-selected={part === key} className={part === key ? 'active' : ''} onClick={() => choosePart(key)} key={key}>
              {key === 'bracket' ? 'Кронштейн' : key === 'flange' ? 'Фланец' : 'Корпус'}
            </button>
          ))}
        </div>
        <span className="workbench-state"><i /> ИНТЕРАКТИВНЫЙ МАКЕТ</span>
      </div>

      <div className="workbench-grid">
        <section className="source-panel panel">
          <div className="panel-heading">
            <div><span>ИСТОЧНИК / 2D</span><strong>{fileName ?? definition.designation}</strong></div>
            <span className="panel-count">{definition.views} ВИДА · {definition.dimensions} РАЗМЕРОВ</span>
          </div>
          <div className="drawing-wrap">
            <TechnicalDrawing part={part} activeStep={activeStep} />
            <div className="drawing-badge"><ScanLine size={13} /> {activeStep === 0 ? 'Ожидает запуска' : `Этап ${activeStep} / ${lastStep}`}</div>
            {activeStep >= 2 && <div className="found-dimension"><Check size={12} /> геометрия согласована</div>}
          </div>
          <UploadControl onFile={handleFile} />
          {fileName && <p className="upload-note">Выбран файл «{fileName}». В этой версии показана интерфейсная симуляция — файл никуда не отправляется.</p>}
        </section>

        <ProgressRail activeStep={activeStep} />

        <section className="model-panel panel">
          <div className="panel-heading">
            <div><span>РЕЗУЛЬТАТ / 3D</span><strong>{definition.name}</strong></div>
            <div className="view-controls" role="group" aria-label="Режим отображения">
              {(['solid', 'wire', 'xray'] as ViewMode[]).map((item) => (
                <button type="button" className={mode === item ? 'active' : ''} onClick={() => setMode(item)} key={item}>
                  {item === 'solid' ? 'Тело' : item === 'wire' ? 'Каркас' : 'Рентген'}
                </button>
              ))}
              <button type="button" className="reset-view" onClick={() => setResetKey((key) => key + 1)} aria-label="Сбросить вид"><RotateCcw size={14} /></button>
            </div>
          </div>
          <div className="viewport-wrap">
            <CadViewport part={part} step={activeStep} mode={mode} resetKey={resetKey} />
            <span className="viewport-hint"><MousePointer2 size={13} /> вращайте модель мышью</span>
            <div className="axis-widget"><span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span></div>
            <div className={`validation-badge ${activeStep === lastStep ? 'valid' : ''}`}>
              {activeStep === lastStep ? <ShieldCheck size={15} /> : <CircleDot size={15} />}
              {activeStep === lastStep ? 'B-rep валидна' : 'Построение'}
            </div>
          </div>
        </section>
      </div>

      <div className="operation-console">
        <div className="timeline-head">
          <div>
            <span className="eyebrow-small">ИСТОРИЯ ПОСТРОЕНИЯ</span>
            <strong>{definition.operations[activeStep].label}</strong>
          </div>
          <div className="timeline-actions">
            <button type="button" onClick={() => setActiveStep((step) => Math.max(0, step - 1))} disabled={activeStep === 0} aria-label="Предыдущий шаг"><ChevronLeft size={17} /></button>
            <button type="button" className="play-button" onClick={handlePlay}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? 'Пауза' : activeStep === lastStep ? 'Повторить' : 'Воспроизвести'}</button>
            <button type="button" onClick={() => setActiveStep((step) => Math.min(lastStep, step + 1))} disabled={activeStep === lastStep} aria-label="Следующий шаг"><ChevronRight size={17} /></button>
          </div>
        </div>
        <div className="timeline-track">
          {definition.operations.map((operation, index) => (
            <button type="button" className={`${index === activeStep ? 'active' : ''} ${index < activeStep ? 'done' : ''}`} onClick={() => { setActiveStep(index); setPlaying(false) }} key={operation.label}>
              <span>{index < activeStep ? <Check size={12} /> : String(index).padStart(2, '0')}</span>
              <em>{operation.short}</em>
            </button>
          ))}
        </div>
        <div className="console-bottom">
          <div className="operation-description">
            <span>{String(activeStep).padStart(2, '0')}</span>
            <p>{definition.operations[activeStep].description}</p>
          </div>
          <div className="code-readout">
            <span><Code2 size={13} /> FeatureScript · схема</span>
            <code>{definition.operations[activeStep].code}</code>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="CADFS — на главную"><LogoMark /><strong>CADFS</strong><span>/ 2D→3D</span></a>
        <nav className={menuOpen ? 'open' : ''} aria-label="Основная навигация">
          <a href="#demo" onClick={() => setMenuOpen(false)}>Демонстрация</a>
          <a href="#pipeline" onClick={() => setMenuOpen(false)}>Конвейер</a>
          <a href="#capabilities" onClick={() => setMenuOpen(false)}>Возможности</a>
          <a href="#research" onClick={() => setMenuOpen(false)}>Исследование</a>
        </nav>
        <div className="header-actions">
          <span className="local-chip"><i /> ДЕМО · БЕЗ ОТПРАВКИ</span>
          <button type="button" className="header-cta" onClick={scrollToDemo}>Открыть стенд <ArrowRight size={15} /></button>
          <button type="button" className="menu-button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label="Открыть меню">{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </header>

      <main>
        <section className="hero" id="top">
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-copy">
            <div className="paper-kicker"><span>RESEARCH DEMO</span><i /> CADFS · CVPR 2026</div>
            <h1>Из 2D-чертежа —<br />в <em>редактируемую</em><br />3D-модель</h1>
            <p>Интерактивная концепция конвейера: система сопоставляет виды и размеры, восстанавливает параметрическую историю и компилирует её в точную B-rep геометрию.</p>
            <div className="hero-actions">
              <button type="button" className="primary-cta" onClick={scrollToDemo}><Play size={16} fill="currentColor" /> Запустить демонстрацию</button>
              <a className="secondary-cta" href="#pipeline">Как это работает <ArrowDown size={15} /></a>
            </div>
            <div className="hero-facts">
              <div><strong>451 тыс.</strong><span>реальных CAD-историй</span></div>
              <div><strong>15</strong><span>операций моделирования</span></div>
              <div><strong>B-rep</strong><span>вместо треугольной сетки</span></div>
            </div>
          </div>
          <HeroVisual />
        </section>

        <section className="demo-section" id="demo">
          <div className="section-intro">
            <div>
              <span className="section-number">01 / ДЕМОНСТРАЦИЯ</span>
              <h2>Один лист. Одна история построения.</h2>
            </div>
            <p>Выберите пример, перемещайтесь по операциям и вращайте результат. Чертёж, CAD-команда и геометрия меняются синхронно.</p>
          </div>
          <DemoWorkbench />
          <div className="research-note">
            <FileText size={18} />
            <p><strong>Граница исследования.</strong> В статье CADFS модель получает текст или сетку из четырёх 2D-рендеров, а не произвольный PDF-чертёж. Распознавание ЕСКД, OCR размеров и экспорт STEP/.grb здесь показаны как продуктовый слой поверх исследовательского ядра.</p>
          </div>
        </section>

        <section className="pipeline-section" id="pipeline">
          <div className="section-intro light">
            <div>
              <span className="section-number">02 / КОНВЕЙЕР</span>
              <h2>От пикселей — к логике модели</h2>
            </div>
            <p>Ценность CADFS не только в итоговой форме. На выходе остаются операции, параметры и ссылки на грани и рёбра — их можно проверить и изменить.</p>
          </div>
          <div className="pipeline-list">
            {PIPELINE.map(([num, title, text], index) => (
              <article key={num}>
                <span>{num}</span>
                <div className="pipeline-icon">
                  {index === 0 ? <ScanLine /> : index === 1 ? <Sparkles /> : index === 2 ? <Code2 /> : index === 3 ? <Boxes /> : <ShieldCheck />}
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
                {index < PIPELINE.length - 1 && <ArrowRight className="pipeline-arrow" />}
              </article>
            ))}
          </div>
          <div className="history-feature">
            <div className="history-copy">
              <span className="section-number">ПАРАМЕТРИЧЕСКАЯ ИСТОРИЯ</span>
              <h3>Не «похожая форма».<br />Воспроизводимая модель.</h3>
              <p>FeatureScript описывает последовательность построения и умеет устойчиво обращаться к конкретным геометрическим сущностям: телам, граням, рёбрам и вершинам.</p>
              <ul>
                <li><Check size={14} /> Натуральные инженерные размеры</li>
                <li><Check size={14} /> Редактируемые операции и зависимости</li>
                <li><Check size={14} /> Компиляция в граничное представление</li>
              </ul>
            </div>
            <div className="code-card" aria-label="Пример истории FeatureScript">
              <div className="code-card-bar"><span><i /><i /><i /></span><em>bracket.fs</em><b>FeatureScript</b></div>
              <ol>
                <li><span>01</span><code><i>sketch</i>(<b>"S1"</b>, plane: TOP);</code></li>
                <li><span>02</span><code><i>extrude</i>(<b>"F1"</b>, depth: <strong>12 * mm</strong>);</code></li>
                <li><span>03</span><code><i>hole</i>(<b>"F2"</b>, diameter: <strong>14 * mm</strong>);</code></li>
                <li className="selected"><span>04</span><code><i>fillet</i>(<b>"F3"</b>, edges: <u>makeQuery("F1")</u>,</code></li>
                <li className="selected"><span>05</span><code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;radius: <strong>6 * mm</strong>);</code></li>
                <li><span>06</span><code><i>validate</i>(<b>"B-rep"</b>);</code></li>
              </ol>
              <div className="code-status"><Check size={14} /> Запрос однозначно выбрал 4 ребра</div>
            </div>
          </div>
        </section>

        <section className="capabilities-section" id="capabilities">
          <div className="section-intro">
            <div>
              <span className="section-number">03 / ВОЗМОЖНОСТИ</span>
              <h2>15 операций вместо двух</h2>
            </div>
            <p>Предыдущие крупные датасеты истории построения в основном ограничивались Sketch + Extrude. CADFS охватывает полноценный набор построения, уточнения и повторного использования геометрии.</p>
          </div>
          <div className="ops-grid">
            {OPS.map(([name, label], index) => (
              <article key={name}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div className={`op-glyph glyph-${index % 6}`}><i /><i /><i /></div>
                <strong>{name}</strong>
                <em>{label}</em>
              </article>
            ))}
            <article className="more-ops"><span>+04</span><Box /><strong>И другие</strong><em>Полный набор: 15 типов</em></article>
          </div>
          <div className="output-band">
            <div>
              <span className="section-number">ЧТО ПОЛУЧАЕТ ИНЖЕНЕР</span>
              <h3>CAD-результат, готовый к дальнейшей работе</h3>
            </div>
            <div className="output-cards">
              <article><Layers3 /><strong>FeatureScript</strong><span>исходная история построения</span></article>
              <article><Boxes /><strong>B-rep</strong><span>скомпилированная геометрия</span></article>
              <article><ArrowRight /><strong>STEP / .grb</strong><span>через интеграционный CAD-коннектор</span></article>
            </div>
          </div>
        </section>

        <section className="research-section" id="research">
          <div className="research-copy">
            <span className="section-number">04 / ИССЛЕДОВАНИЕ CADFS</span>
            <h2>Обучено на реальных историях проектирования</h2>
            <p>Авторы реконструировали чистые исполняемые программы FeatureScript из внутреннего представления Onshape, нормализовали единицы и параметры, заменили неустойчивые ссылки и отсеяли программы, которые не воспроизводили исходную геометрию.</p>
            <a className="paper-link" href="https://voyleg.github.io/cadfs/" target="_blank" rel="noreferrer">Открыть проект CADFS <ExternalLink size={15} /></a>
          </div>
          <div className="data-comparison">
            <div className="comparison-head"><span>ДАТАСЕТ</span><span>ПРЕДСТАВЛЕНИЕ</span><span>ОПЕРАЦИИ</span><span>МОДЕЛИ</span></div>
            <div><strong>DeepCAD</strong><span>Cmd. sequence</span><em>2</em><b>179 тыс.</b></div>
            <div><strong>Text2CAD</strong><span>Cmd. sequence</span><em>2</em><b>170 тыс.</b></div>
            <div><strong>Cadrille</strong><span>Python code</span><em>2</em><b>170 тыс.</b></div>
            <div className="highlight"><strong>CADFS</strong><span>FeatureScript</span><em>15</em><b>451 тыс.</b></div>
          </div>
          <div className="metrics-strip">
            <article><span>ТЕКСТ → CAD</span><strong>0,07</strong><em>Chamfer Distance ↓</em></article>
            <article><span>ТЕКСТ → CAD</span><strong>98,7</strong><em>Normal Consistency ↑</em></article>
            <article><span>ИЗОБРАЖЕНИЯ → CAD</span><strong>0,35</strong><em>Chamfer Distance ↓</em></article>
            <article><span>ИЗОБРАЖЕНИЯ → CAD</span><strong>96,1</strong><em>Normal Consistency ↑</em></article>
          </div>
          <p className="metrics-note">Метрики приведены для тестовой выборки CADFS с 15 операциями. При сложной реконструкции по изображениям доля некомпилируемых программ (IR) составила 29% — поэтому промышленному конвейеру нужен цикл проверки и исправления. Это исследовательские результаты, а не гарантия точности на произвольных чертежах.</p>
        </section>

        <section className="final-cta">
          <div className="final-grid" aria-hidden="true" />
          <span>CADFS / 2D→3D</span>
          <h2>Посмотрите, как чертёж<br />становится историей построения.</h2>
          <button type="button" onClick={scrollToDemo}><Play size={17} fill="currentColor" /> Запустить демонстрацию</button>
          <p>Интерактивный исследовательский макет · данные не отправляются</p>
        </section>
      </main>

      <footer>
        <a className="brand" href="#top"><LogoMark /><strong>CADFS</strong><span>/ 2D→3D</span></a>
        <p>Демонстрационный интерфейс по материалам Pyatov et al., «CADFS: A Big CAD Program Dataset and Framework for Computer-Aided Design with Large Language Models», CVPR 2026.</p>
        <a href="#top">Наверх <ArrowDown size={14} className="footer-up" /></a>
      </footer>
    </div>
  )
}

export default App
