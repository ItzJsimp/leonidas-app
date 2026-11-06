# Local AI Desktop

AI Desktop lets an agent use a Windows VirtualBox guest while you continue using your own mouse. Install VirtualBox on the Windows machine running your Leonidas server, create a Windows VM, and start it in VirtualBox. Install Guest Additions and enable the VM's USB tablet pointing device for absolute mouse input. You provide the Windows installer and a valid license; an evaluation installation is not a permanent free license.

Open a saved thread in the web or desktop client, choose **AI Desktop** in the thread header, select a running VM, and connect. Connecting grants that thread guest control. Only one thread can control a VM at a time. The viewer refreshes screenshots while visible; it is not a video stream. A remote web client watches the VM on its connected environment's server, not on the browser's machine. The native mobile client does not yet have an AI Desktop viewer.

**Pause AI input** stops new agent input while leaving screenshots available. Resume from the viewer when ready. **Release** revokes the connection without shutting down the VM. Hiding the viewer leaves the connection active. Restarting the server clears all connections and requires a new grant.

Agents in Leonidas use `local_vm_list`, `local_vm_screenshot`, and `local_vm_input`. They cannot connect a VM, resume a paused connection, or control the host desktop through these tools. Text entry supports printable ASCII and a small set of common keys. External ChatGPT or Claude desktop tools are not automatically redirected to the guest. Providers that support Leonidas MCP can use these tools; other providers must use the viewer until they support MCP.

This first release connects existing VMs. It does not download Windows, provision a guest, sign into applications, or store guest credentials. For a nonstandard VirtualBox installation, set `T3CODE_VBOXMANAGE` on the server to the full path of `VBoxManage.exe` before starting it.
