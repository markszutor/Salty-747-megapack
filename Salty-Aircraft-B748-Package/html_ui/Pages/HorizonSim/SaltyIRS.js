class SaltyIRS {
    constructor() {
        console.log("SaltyIRS loaded");
    }
    init() {
        this.irsTimer = -1;
    }
    update(electricityIsAvail) {
        // Calculate deltatime
        var timeNow = Date.now();
        if (this.lastTime == null) this.lastTime = timeNow;
        var deltaTime = timeNow - this.lastTime;
        this.lastTime = timeNow;
        
        if (!electricityIsAvail) return;

        var latitude = Math.abs(SimVar.GetSimVarValue("PLANE LATITUDE", "radians") * 180 / Math.PI);
        var latitudeFactor = Math.cos(Math.abs(SimVar.GetSimVarValue("PLANE LATITUDE", "radians")));
        var IRSState = SimVar.GetSimVarValue("L:SALTY_IRS_STATE", "Enum");
        var isIRSOn = ((SimVar.GetSimVarValue("L:747_IRS_KNOB_1", "Enum") >= 1) && (SimVar.GetSimVarValue("L:747_IRS_KNOB_2", "Enum") >= 1) && (SimVar.GetSimVarValue("L:747_IRS_KNOB_3", "Enum") >= 1));
        var isSomeIRSOn = ((SimVar.GetSimVarValue("L:747_IRS_KNOB_1", "Enum") >= 1) || (SimVar.GetSimVarValue("L:747_IRS_KNOB_2", "Enum") >= 1) || (SimVar.GetSimVarValue("L:747_IRS_KNOB_3", "Enum") >= 1));
        SimVar.SetSimVarValue("L:SALTY_IRS_TIME_LEFT", "Enum", this.irsTimer);

        if (!isSomeIRSOn && IRSState != 0) {
            SimVar.SetSimVarValue("L:SALTY_IRS_STATE", "Enum", 0);
            IRSState = 0;
        }

        if (isIRSOn && IRSState == 0) {
            SimVar.SetSimVarValue("L:SALTY_IRS_STATE", "Enum", 1);
            IRSState = 1;

            if (latitude < 70.2) {
                this.irsTimer = 600;
            }
            else if (latitude >= 70.2 && latitude < 78.2) {
                this.irsTimer = 1020;
            }
            else {
                this.irsTimer = 1020 * (1 + (1 / latitudeFactor));
            }
        }

        if (IRSState == 1) {
            if (this.irsTimer > 0) {
                this.irsTimer -= deltaTime / 1000;
                if (this.irsTimer <= 0) {
                    this.irsTimer = -1;
                    SimVar.SetSimVarValue("L:SALTY_IRS_STATE", "Enum", 2);
                }
            }
        }
    }
}
