import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { useAtom } from "jotai";
import { settingsAtom } from "@/store/settings";
import ThemeSelector from "./ThemeSelector";
import { useUser } from "@/contexts/UserContext";

const isAdminRole = (role?: string): boolean => role?.trim().toLowerCase() === "admin";

const SettingPanel: React.FC = () => {
  const [settings, setSettings] = useAtom(settingsAtom);
  const { user } = useUser();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="darkMode" className="font-medium">
            Dark Mode
          </Label>
          <p className="text-sm text-gray-500">Toggle dark mode appearance</p>
        </div>
        <Switch
          id="darkMode"
          checked={settings.darkMode}
          onCheckedChange={(checked) => setSettings({ darkMode: checked })}
        />
      </div>

      <ThemeSelector />

      {isAdminRole(user?.role) && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="space-y-0.5">
              <Label htmlFor="adminApiKey" className="font-medium">
                Admin API Key
              </Label>
              <p className="text-sm text-gray-500">
                Required to view full project data (admin-only). Stored only in this browser.
              </p>
            </div>
            <Input
              id="adminApiKey"
              type="password"
              placeholder="X-API-Key"
              value={settings.adminApiKey}
              onChange={(e) => setSettings({ adminApiKey: e.target.value })}
            />
          </div>
        </>
      )}

      <Separator />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="tickOffset" className="font-medium">
              Tick Offset
            </Label>
            <p className="text-sm text-gray-500">Current value: {settings.tickOffset}</p>
          </div>
          <span className="text-sm font-medium">{settings.tickOffset}</span>
        </div>
        <Slider
          id="tickOffset"
          min={15}
          max={50}
          step={1}
          value={[settings.tickOffset]}
          onValueChange={(value) => setSettings({ tickOffset: value[0] })}
          className="w-full"
        />
      </div>
    </div>
  );
};

export default SettingPanel;
