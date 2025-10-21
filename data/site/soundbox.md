---
title: "Bergpreis - Soundbox"
repoUrl: ""
role: "Embedded Systems Developer"
technologies: [ "STM32", "C", "FreeRTOS", "SPI", "UART", "I2C", "DAC", "DMA", "STM32CubeMX", "CLion" ]
status: "Completed"
writtenAt: "2025-10-21T00:00:00.000Z"
updatedAt: "2025-10-21T00:00:00.000Z"
---

<!-- description -->
The Bergpreis Soundbox is an embedded audio playback system I developed during my apprenticeship. It replaces a
disruptive siren in an interactive game with dynamic, high-quality sound effects and music played from an SD card,
controlled by an STM32 microcontroller.
<!-- /description -->

<!-- content -->

# Bergpreis Soundbox: Engineering a Better Game Experience

## The Idea: What It Is and Why I Built It

During my apprenticeship as an Electronic Technician at the Technische Fachschule Bern (TFBern), I had the opportunity
to work on a fascinating project: the "Bergpreis - Soundbox." This project was an enhancement for an existing
interactive game called "Bergpreis" (Mountain Prize), which was used to engage audiences at fairs and events.

**What was the "Bergpreis" game about?**

The game involved two participants on stationary bicycles. After a start signal, they had to pedal as hard as possible,
making their virtual figures climb a mountain on a screen. The faster they pedaled, the quicker their figure ascended.
The original system used a loud and, frankly, quite disruptive siren for acoustic feedback. While effective at grabbing
attention, it wasn't ideal for all environments and could become annoying over extended periods, especially in quieter
settings or during prolonged use at exhibitions.

This is where the Soundbox came in. The goal was to replace the siren with a more sophisticated and flexible audio
solution. Instead of a single, blaring noise, the new system needed to:

* Play various sound effects or music tracks (WAV files).
* Store these audio files on a readily available medium (a MicroSD card).
* Allow for volume control to suit different environments.
* Integrate with the existing game controller with minimal modification, as much of the game was already developed.

The Soundbox project was my Individual Practical Work (IPA), a significant part of my apprenticeship, allowing me to
apply and expand my skills in electronics and embedded systems.

## The Journey: From Concept to Reality

Developing the Soundbox involved designing custom hardware, writing embedded software, and integrating everything into a
functional unit.

**Hardware Design:**

The heart of the Soundbox is an **STM32G474CET6 microcontroller**. This powerful MCU was chosen for its processing
capabilities, suitable for handling audio data and real-time operations.

The key hardware components and design aspects include:

* **Audio Storage:** A **MicroSD card slot** allows for easy storage and updating of WAV audio files. Communication with
  the SD card is handled via the **SPI** (Serial Peripheral Interface) protocol.
* **Audio Output:** The digital audio data from the MCU is converted to an analog signal by its internal **DAC** (
  Digital-to-Analog Converter). This signal is then fed to an external **Adafruit MAX9744 Class-D stereo audio amplifier
  **, capable of delivering up to 20W per channel. We used one channel for a clear, loud output. The amplifier's volume
  and mute functions are controlled via **I2C**.
* **Control Interface:** The Soundbox receives commands from the main "Bergpreis" game controller via a **UART** (
  Universal Asynchronous Receiver/Transmitter) interface. This was crucial as the existing game system had limited
  available connections. We cleverly used the power supply line to also carry these data signals, which were then
  separated on the Soundbox PCB.
* **Power Supply:** The system is powered by a 12V input, which is then regulated down to 3.3V for the microcontroller
  and other digital components using an on-board switching regulator.
* **Custom PCB:** I designed a custom Printed Circuit Board (PCB) to house the microcontroller, SD card slot, power
  regulation circuitry, and connectors for the amplifier and external signals.
* **Enclosure:** A custom 3D-printed enclosure was designed to protect the electronics, aiming for a degree of
  robustness and resistance to light moisture, suitable for event use. It also included mounts for signal LEDs.

**Software Development:**

The firmware for the STM32 microcontroller was developed to be modular and responsive.

* **Real-Time Operating System (RTOS):** **FreeRTOS** was used to manage multiple tasks concurrently. This was essential
  for handling audio playback, command processing, and other background operations smoothly without interference.
* **File System:** The **FatFs** library was integrated to manage files on the MicroSD card, allowing the Soundbox to
  read the WAV audio files.
* **Audio Playback Engine:** This core software module is responsible for:
    * Parsing WAV file headers to understand audio format (e.g., sample rate).
    * Reading audio data from the SD card.
    * Managing audio buffers.
    * Continuously feeding data to the MCU's DAC using **DMA** (Direct Memory Access). DMA is critical here as it
      offloads the CPU from the repetitive task of sending data samples to the DAC, freeing it up for other tasks and
      ensuring smooth, uninterrupted audio.
* **Command Handling:** A UART-based command protocol was defined to allow the main game to control the Soundbox. For
  example, a specific byte value would instruct the Soundbox to play "1.wav" or set the volume to a certain level. The
  protocol was designed to be simple, using single-byte commands to minimize transmission time over the shared
  power/data line.
    * The command byte was structured with the first 3 bits defining the command (e.g., Play, Stop, Set Volume, Mute)
      and the remaining 5 bits for parameters (e.g., track number 1-31, volume level 0-31).
* **Audio File Preparation:** Audio files (e.g., MP3 or other WAV formats) needed to be converted to a specific format:
  16-bit Mono PCM WAV. The open-source tool **FFmpeg** was recommended for this conversion process.
* **Development Environment:** The firmware was developed using **STM32CubeMX** and **CLion**.

The overall software architecture separated hardware control, service logic (managing playback states), and application
logic (responding to commands).

## Navigating Challenges: Hurdles and Solutions

This project presented several interesting challenges:

* **Technical Challenges:**
    * **Smooth Audio Playback:** Ensuring continuous, glitch-free audio playback was paramount. This required careful
      management of data buffers, precise timing for the DAC, and efficient use of DMA and FreeRTOS to prevent underruns
      or overruns. The STM32G474's 170 MHz clock speed was beneficial here.
    * **Limited Interface:** The constraint of using the existing power line for data communication required a robust
      separation and signal conditioning circuit and a simple, reliable UART protocol.
    * **SD Card Reliability:** Interfacing with SD cards can sometimes be tricky; ensuring stable communication via SPI
      and proper handling with FatFs was important.
    * **Enclosure Design:** Creating a compact yet robust enclosure that allowed for easy assembly and access while
      providing some protection was an iterative process. The initial design for mounting signal lights had a slight
      measurement error that needed a workaround.
* **Non-Technical Challenges:**
    * Like any project, managing time effectively and debugging complex embedded systems (where you can't just `print()`
      everything easily) were part of the learning curve.

* **Solutions:**
    * The use of **DMA** for both DAC output and SPI communication significantly reduced CPU load, which was key for
      smooth audio.
    * **FreeRTOS** helped structure the code and manage concurrent operations, preventing tasks from blocking each
      other.
    * **Modular firmware design** made it easier to develop, test, and debug individual components of the software.
    * Careful **PCB layout**, keeping analog and digital grounds separate where appropriate, and using bypass capacitors
      helped with noise.
    * For the signal light mounting, while not perfect, there was still enough space to securely mount them.

## The Outcome: Where It Stands and What I Learned

The Bergpreis Soundbox project was successfully completed. The final unit could reliably receive commands and play the
corresponding WAV audio files from the MicroSD card, with controllable volume. It effectively replaced the old siren
system, meeting all the core requirements defined in the project brief.

* **Goals Achieved:** Yes, the primary goal of creating a flexible, SD card-based audio playback system to enhance the "
  Bergpreis" game was met.
* **Key Learnings:** This project was an immense learning experience. I gained practical skills and deeper understanding
  in:
    * **Microcontroller Programming:** Working extensively with the STM32 platform.
    * **Peripheral Interfacing:** Implementing SPI for SD cards, I2C for the audio amplifier, UART for command input,
      and using DACs and DMA.
    * **Real-Time Operating Systems:** Practical application of FreeRTOS for task scheduling and inter-task
      communication.
    * **Audio Fundamentals:** Understanding WAV file formats and digital audio playback.
* **Proudest Aspect:** Seeing (and hearing!) the whole system come together – from designing the PCB, soldering
  components, writing the firmware, to finally playing custom sounds on command – was incredibly rewarding. The
  successful integration of FreeRTOS and DMA for smooth audio playback felt like a significant achievement.

The Bergpreis Soundbox was a challenging yet highly fulfilling project that significantly contributed to my skills as an
aspiring Electronic Technician.
<!-- /content -->