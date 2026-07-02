# Orquestación de subagentes (uso exclusivo del orquestador)

Este documento es solo para el modelo orquestador (Sonnet/Opus). **No se le indica a un subagente que lo lea** — el subagente recibe únicamente el extracto de contexto que necesita, incluido directamente en su prompt.

## Cómo implementar checkpoints

Usa el agente `claude` con modelo **Haiku** como implementador y el modelo principal (Sonnet) como orquestador de razonamiento.

**Los subagentes Haiku deben arrancar activando Ponytail** para evitar sobreingeniería. Incluir siempre al inicio del prompt:

```
Activa el skill ponytail antes de empezar usando: Skill({ skill: "ponytail" })
Reglas Ponytail que aplican a este proyecto:
- Un schema Zod → un archivo, no duplicar entre service y route
- Servicios reciben typed input ya validado, no re-parsean
- Sin checks redundantes si el middleware chain ya los cubre
- Shortest working diff wins — no abstracciones para un solo uso
```

## Template de prompt para subagente

No le digas "lee CLAUDE.md" — dale el extracto ya resuelto (arquitectura + convenciones + reglas de seguridad relevantes a su tarea), porque arranca en frío y leer el archivo completo le carga contexto de orquestación que no necesita.

```
Agent({
  description: "Implementar checkpoint N — <nombre>",
  model: "haiku",
  prompt: `
    Activa el skill ponytail antes de empezar usando: Skill({ skill: "ponytail" })

    Eres un implementador de backend TypeScript/Express para FinanceVier.

    Arquitectura relevante:
    <pegar aquí solo las rutas/módulos de src/ que le tocan a este checkpoint>

    Checkpoint a implementar: <N — nombre>
    Tareas: <lista de tareas del tasks.md>
    Tests requeridos: <lista del test-plan.md>

    Flujo obligatorio:
    1. Escribir tests fallidos primero
    2. Implementar mínimo para pasar
    3. Correr npx tsc --noEmit && npx vitest run
    4. Marcar tareas en tasks.md
    5. Reportar en español con el template de checkpoint

    Reglas de seguridad que nunca puedes omitir:
    - Nunca almacenar tokens en plaintext
    - Siempre usar transacciones Prisma para mutaciones de balance
    - Siempre verificar ownership además del rol
    - AppError para errores de dominio, 500 para inesperados

    Prohibido: no lances otros subagentes, no leas este archivo de orquestación.
  `
})
```

El orquestador (Sonnet) revisa el reporte del subagente, valida contra las specs, y decide si aprobar o pedir correcciones antes del siguiente checkpoint.
