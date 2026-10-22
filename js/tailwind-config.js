// Identité : noir (slate) + orange (indigo/purple) + bleu du logo Eurequat (cyan)
tailwind.config = {
    theme: {
        extend: {
            spacing: { 13: '3.25rem' },
            colors: {
                slate: {50:'#fafafa',100:'#f4f4f5',200:'#e4e4e7',300:'#d4d4d8',400:'#a1a1aa',500:'#71717a',600:'#52525b',700:'#3f3f46',750:'#323238',800:'#27272a',850:'#1f1f22',900:'#18181b',950:'#09090b'},
                indigo: {50:'#fff7ed',100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',600:'#ea580c',700:'#c2410c',800:'#9a3412',900:'#7c2d12',950:'#431407'},
                purple: {50:'#fffbeb',100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f',950:'#451a03'},
                cyan: {50:'#eef1fa',100:'#e0e5f5',200:'#c3cceb',300:'#8fa0dc',400:'#6378c4',500:'#3f58b0',600:'#31459a',700:'#263a8a',800:'#1e2e6e',900:'#172254',950:'#0f1638'}
            },
            animation: { 'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite' }
        }
    }
};
