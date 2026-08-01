set default-list
set minimum-version := "1.57.0"

pi_dir := "config/pi/.pi/agent"

# Install Pi extension development dependencies
pi-install:
    pnpm --dir "{{ pi_dir }}" install

# Check Pi extension formatting, linting, and types
pi-check:
    pnpm --dir "{{ pi_dir }}" fmt:check
    pnpm --dir "{{ pi_dir }}" lint
    pnpm --dir "{{ pi_dir }}" check

# Format Pi extensions
pi-format:
    pnpm --dir "{{ pi_dir }}" fmt
