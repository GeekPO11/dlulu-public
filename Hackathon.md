# Dlulu: From Delusion to Execution

**Dlulu** is an AI-first "Execution Infrastructure" that transforms high-level ambitions into concrete, scheduled action plans. We built Dlulu to solve the "execution gap"—the void between having a big idea and knowing exactly what to do at 9 AM on a Tuesday.

### Gemini 3 Integration
We leveraged **Gemini 3 Flash** as the core reasoning engine across our entire stack, utilizing its expanded context window and advanced reasoning capabilities to act as a full-tier product manager and agile coach.

*   **Deep Reasoning for Roadmap Generation:** We use `gemini-3-flash-preview` to decompose vague user ambitions (e.g., "Build a $1M startup") into hierarchical, dependency-aware roadmaps. Gemini parses the nuance of the goal, identifies critical milestones, and generates a Miller Column-style dependency tree.
*   **Systemic Scheduling:** Unlike standard chatbots, our implementation gives Gemini "systemic" agency. It doesn't just chat; it reads the user's Google Calendar availability and maps roadmap tasks directly onto their schedule, resolving conflicts ("Team Sync" vs. "Deep Work") in real-time.
*   **Multimodal Context:** We utilize Gemini's multimodal capabilities to allow users to upload "vision boards" or messy whiteboard sketches, which the model translates into structured project specifications.
*   **Agentic Coaching:** The "Ambition Coach" persona uses Gemini's fine-tuned instruction following to maintain a specific, high-agency tone—pushing users to execute rather than just planning endlessly.

By centering our architecture around Gemini 3's speed and cost-efficiency, we achieved real-time roadmap generation that would have been prohibitively slow or expensive with previous generation models.


### Links
*   **Live Demo:** [INSERT_YOUR_VERCEL_OR_NETLIFY_LINK_HERE]
*   **Video Walkthrough:** [INSERT_YOUR_YOUTUBE_LINK_HERE]
*   **Public Code:** [https://github.com/GeekPO11/dlulu-public](https://github.com/GeekPO11/dlulu-public)

### Testing Instructions
To experience the full "Delusion to Execution" pipeline:

1.  **Sign Up:** Create a new account (no email verification required for demo).
2.  **The Interface:** You will be greeted by the specialized "Ambition Intake" interface.
3.  **Enter a Goal:** Try something ambiguous like "Run a marathon" or "Launch a SaaS product."
4.  **Gemini 3 Analysis:** Watch as the system (powered by `gemini-3-flash-preview`) interviews you to clarify constraints.
5.  **Roadmap Generation:** Click "Generate Plan" and observe the "Neuro-Symbolic" planning phase where Gemini constructs a dependency graph.
6.  **Calendar Integration:** (If you connect Google Calendar) See how the AI negotiates with your actual schedule to place tasks.
7.  **Chat with Coach:** Open the chat and ask "How do I start?" to see the persona-driven guidance.
