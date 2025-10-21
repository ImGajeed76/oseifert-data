---
title: "Charmer"
repoUrl: "https://github.com/ImGajeed76/charmer"
role: "Creator"
technologies: [ "Go", "Charm", "Bubble Tea", "Lipgloss" ]
status: "Creator"
writtenAt: "2025-10-21T00:00:00.000Z"
updatedAt: "2025-10-21T00:00:00.000Z"
---

<!-- description -->
Charmer is a Go package designed to automatically generate Terminal User Interfaces (TUIs) directly from your Go
functions. Leveraging the power of Charm libraries, it aims to transform annotated functions into interactive
command-line interfaces, removing the need to manually build the UI.
<!-- /description -->

<!-- content -->

# Charmer: Turning Go Functions into Interactive TUIs

## The Idea: What It Is and Why I Built It

Charmer is a Go library that takes specially annotated Go functions and automatically builds a navigable Terminal User
Interface (TUI) around them. The core idea is to drastically simplify the process of creating command-line tools that
need more than just simple flags – tools where users can browse and execute different functionalities easily.

The motivation for Charmer grew directly out of my work on
the [TFUtils-GO](https://oseifert.vercel.app/projects/933782301) project. While rewriting TFUtils in Go, I realized I
needed a robust way to discover and present various commands (like project setup, file management, etc.) within a TUI.
Instead of building this logic directly into TFUtils-GO, I saw an opportunity to create a separate, reusable library. I
wanted something modular that could potentially be used for other Go applications needing a simple TUI structure, not
just for my specific TFBern tool.

Currently, the primary user is TFUtils-GO (and therefore, myself and potentially fellow students). However, I envision
Charmer being useful for any Go developer who wants to quickly expose functions through an interactive command-line
interface without getting bogged down in TUI implementation details.

## The Journey: From Concept to Reality

The core technical choice was to build upon the excellent [Charm](https://charm.sh/) ecosystem (libraries like Bubble
Tea for TUI logic and Lipgloss for styling). These libraries provide the building blocks for creating beautiful and
functional TUIs in Go. My goal with Charmer was to create a higher-level abstraction *on top* of Charm, specifically
focused on the pattern of "functions as commands."

Instead of relying on runtime reflection, the design uses a **custom code generator**. Before building the final
application, the developer runs this generator. It scans the project for specially marked functions (the "Charms"),
gathers information about them (like their names and parameters), and then **generates Go code that explicitly imports
and registers these functions** within the Charmer framework. This generated file is then compiled into the final
binary. This approach avoids the potential overhead and complexities of reflection and ensures that all discoverable
functions are known at compile time. A significant part of the early development focused on building this generator and
defining how functions should be structured or annotated to be correctly picked up and integrated into the TUI.

As the idea developed, I realized that many command-line tools interact with files and configurations. This led to
developing helper components within Charmer itself, aiming to make common tasks easier for the functions that Charmer
would eventually expose.

## Navigating Challenges: Hurdles and Solutions

One of the main challenges was designing abstractions that are both powerful and simple to use. I wanted to hide
complexity without losing flexibility. A prime example arose when dealing with file operations needed by TFUtils-GO
commands.

* **Challenge:** How to handle file operations consistently, whether the files are local or on a remote server (like
  SFTP), without forcing the developer using Charmer to write complex conditional logic?
* **Solution:** I developed my own path handling abstraction within Charmer, inspired by Python's `pathlib`. This allows
  treating different kinds of paths (local, SFTP) uniformly. You can create path objects for different sources and use
  simple methods like `CopyTo` to transfer files between them, abstracting away the underlying protocol differences.

  Here’s a conceptual example of what this enables:
  ```go
  // NOTE: This is illustrative syntax and may change.
  
  // Define a path on an SFTP server
  path1 := path.New("sftp://user@domain.com/remote/path/file.txt")
  // Define a local path
  path2 := path.New("/local/destination/file.txt")
  
  // Copy from SFTP to local with one command
  err := path1.CopyTo(path2)
  ```

* **Challenge:** If Charmer's helpers handle SFTP, how do we manage credentials securely without hardcoding them or
  constantly prompting the user?
* **Solution:** I created a small configuration management utility built around
  the [go-keyring](https://github.com/zalando/go-keyring) library. This allows storing sensitive information like
  passwords or API keys securely in the operating system's native keyring.

  ```go
  // NOTE: This is illustrative syntax and may change.
  
  // Create a config instance tied to a specific environment/app name
  cfg := config.New("my-app-config")
  
  // Set a secret value (stored securely in the keyring)
  err := cfg.Set("sftp_password", "mySecretPassword")
  
  // Retrieve the secret value later
  password := cfg.Get("sftp_password")
  ```
  This way, credentials are kept safe, managed by the OS, and easily accessible when needed by Charmer-powered
  functions.

## The Outcome: Where It Stands and What I Learned

Charmer is still in the early stages of development, but the core concept is taking shape, and it's already serving its
initial purpose as the engine for TFUtils-GO. While the ultimate goal of a fully generic, easy-to-use TUI generator
isn't complete, it feels achievable.

This project has been a great way to dive deeper into Go, particularly exploring generators, interface design, and
building reusable libraries. Working with the Charm libraries has also been insightful. I've learned a lot about the
importance of good abstraction and how challenging but rewarding it can be to design APIs that are simple on the surface
but handle complexity underneath.

I'm particularly pleased with the path handling abstraction. The ability to represent and operate on local and remote
files using the same interface feels like a powerful simplification, making it much cleaner to write functions that
interact with different file systems.

Future plans for Charmer include:

* Refining the function annotation and discovery process.
* Improving the generated UI/UX and developer experience (DX).
* Adding more tests to ensure it works reliably across different platforms.
* Expanding the built-in helpers based on common needs for CLI tools.
* Improving overall performance and robustness.

<!-- /content -->