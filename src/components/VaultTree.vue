<script setup lang="ts">
import type { VaultNode } from "../types"

defineOptions({ name: "VaultTree" })

const props = defineProps<{
	nodes: VaultNode[]
	parentId: string
	selectedFolderId: string
	selectedFileId: string
	checkedIds: string[]
}>()

const emit = defineEmits<{
	(e: "open-folder", id: string): void
	(e: "open-file", id: string): void
	(e: "toggle-check", id: string): void
	(e: "clear-check"): void
}>()

function childNodes(parentId: string): VaultNode[] {
	return props.nodes
		.filter((node) => node.parentId === parentId)
		.sort((a, b) => {
			if (a.kind !== b.kind) {
				return a.kind === "folder" ? -1 : 1
			}
			return a.name.localeCompare(b.name)
		})
}

function openFolder(id: string): void {
	emit("clear-check")
	emit("open-folder", id)
}

function openFile(id: string): void {
	emit("clear-check")
	emit("open-file", id)
}

function displayName(node: VaultNode): string {
	if (node.kind === "file") {
		return node.name.replace(/\.md$/i, "")
	}
	return node.name
}
</script>

<template>
	<ul class="grid gap-1">
		<li v-for="node in childNodes(parentId)" :key="node.id" class="grid gap-1">
			<div class="flex items-center gap-2">
				<button
					class="h-5 w-5 rounded border text-xs font-bold leading-none"
					:class="
						checkedIds.includes(node.id)
							? 'border-teal-500 bg-teal-500 text-white'
							: 'border-teal-300 text-transparent'
					"
					@click.stop="emit('toggle-check', node.id)">
					✓
				</button>

				<button
					v-if="node.kind === 'folder'"
					class="w-full rounded-lg px-3 py-2 text-left text-sm"
					:class="
						node.id === selectedFolderId
							? 'bg-teal-100 text-teal-700'
							: 'text-teal-700 hover:bg-teal-50'
					"
					@click.stop="openFolder(node.id)">
					📁 {{ displayName(node) }}
				</button>

				<button
					v-else
					class="w-full rounded-lg px-3 py-2 text-left text-sm"
					:class="
						node.id === selectedFileId
							? 'bg-cyan-100 text-cyan-700'
							: 'text-cyan-700 hover:bg-cyan-50'
					"
					@click.stop="openFile(node.id)">
					📝 {{ displayName(node) }}
				</button>
			</div>

			<div
				v-if="node.kind === 'folder'"
				class="ml-3 border-l border-teal-100 pl-2">
				<VaultTree
					:nodes="nodes"
					:parent-id="node.id"
					:selected-folder-id="selectedFolderId"
					:selected-file-id="selectedFileId"
					:checked-ids="checkedIds"
					@open-folder="emit('open-folder', $event)"
					@open-file="emit('open-file', $event)"
					@toggle-check="emit('toggle-check', $event)"
					@clear-check="emit('clear-check')" />
			</div>
		</li>
	</ul>
</template>
