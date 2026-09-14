export class InputManager {
    private keys = new Set<string>();

    mouseX = 0;
    mouseY = 0;

    private mouseButtons = new Set<number>();

    private keyDownHandler: (event: KeyboardEvent) => void;
    private keyUpHandler: (event: KeyboardEvent) => void;
    private mouseMoveHandler: (event: MouseEvent) => void;
    private mouseDownHandler: (event: MouseEvent) => void;
    private mouseUpHandler: (event: MouseEvent) => void;

    constructor() {
        this.keyDownHandler = (event) => {
            this.keys.add(event.key.toLowerCase());
        };

        this.keyUpHandler = (event) => {
            this.keys.delete(event.key.toLowerCase());
        };

        this.mouseMoveHandler = (event) => {
            this.mouseX = event.clientX;
            this.mouseY = event.clientY;
        };

        this.mouseDownHandler = (event) => {
            this.mouseButtons.add(event.button);
        };

        this.mouseUpHandler = (event) => {
            this.mouseButtons.delete(event.button);
        };

        window.addEventListener(
            "keydown",
            this.keyDownHandler
        );

        window.addEventListener(
            "keyup",
            this.keyUpHandler
        );

        window.addEventListener(
            "mousemove",
            this.mouseMoveHandler
        );

        window.addEventListener(
            "mousedown",
            this.mouseDownHandler
        );

        window.addEventListener(
            "mouseup",
            this.mouseUpHandler
        );
    }

    isKeyDown(key: string): boolean {
        return this.keys.has(key.toLowerCase());
    }

    isMouseDown(button: number): boolean {
        return this.mouseButtons.has(button);
    }

    isMovingUp(): boolean {
        return (
            this.isKeyDown("w") ||
            this.isKeyDown("arrowup")
        );
    }

    isMovingDown(): boolean {
        return (
            this.isKeyDown("s") ||
            this.isKeyDown("arrowdown")
        );
    }

    isMovingLeft(): boolean {
        return (
            this.isKeyDown("a") ||
            this.isKeyDown("arrowleft")
        );
    }

    isMovingRight(): boolean {
        return (
            this.isKeyDown("d") ||
            this.isKeyDown("arrowright")
        );
    }

    isSprinting(): boolean {
        return this.isKeyDown("shift");
    }

    isDashing(): boolean {
        return this.isKeyDown(" ");
    }

    isReloading(): boolean {
        return this.isKeyDown("r");
    }

    isInteracting(): boolean {
        return this.isKeyDown("e");
    }

    isPaused(): boolean {
        return (
            this.isKeyDown("escape") ||
            this.isKeyDown("p")
        );
    }

    isConfirming(): boolean {
        return this.isKeyDown("enter");
    }

    getWeaponKey(): number | null {
        if (this.isKeyDown("1")) return 1;
        if (this.isKeyDown("2")) return 2;
        if (this.isKeyDown("3")) return 3;

        return null;
    }

    isShooting(): boolean {
        return this.isMouseDown(0);
    }

    destroy() {
        window.removeEventListener(
            "keydown",
            this.keyDownHandler
        );

        window.removeEventListener(
            "keyup",
            this.keyUpHandler
        );

        window.removeEventListener(
            "mousemove",
            this.mouseMoveHandler
        );

        window.removeEventListener(
            "mousedown",
            this.mouseDownHandler
        );

        window.removeEventListener(
            "mouseup",
            this.mouseUpHandler
        );

        this.keys.clear();
        this.mouseButtons.clear();
    }
}