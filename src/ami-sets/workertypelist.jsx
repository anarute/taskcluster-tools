var React = require('react');
var bs = require('react-bootstrap');
var utils = require('../lib/utils');
var taskcluster = require('taskcluster-client');
var _ = require('lodash');
var format = require('../lib/format');
var Select = require('react-select');
var ConfirmAction = require('../lib/ui/confirmaction');

// temporary until we have an updated taskcluster-client with the new methods in it
var reference = require('./temp-aws-prov-reference');

var WorkerTypeList = React.createClass({
  mixins: [
    utils.createTaskClusterMixin({
      clients: {
        awsProvisioner: taskcluster.createClient(reference),
      },
      clientOpts: {
        awsProvisioner: {
          baseUrl: 'http://localhost:5557/v1',
        },
      },
    }),
    utils.createLocationHashMixin({
      keys: ['selected'],
      type: 'string',
    }),
  ],

  getDefaultProps() {
    return {
      currentAmiSet: '',
    };
  },

  getInitialState() {
    return {
      selectedWorkerTypes: [],
      workerTypeSummaries: [],
      workerTypeSummariesLoaded: false,
      workerTypeSummariesError: null,
      invalidAmis: [],
      errorWorkerTypes: [],
      error: null,
    };
  },

  handleSelectChange(value) {
		// console.log('You\'ve selected:', value);
    this.setState({selectedWorkerTypes: value});
  },

  toggleDisabled(e) {
    this.setState({disabled: e.target.checked});
  },

  load() {
    return {
      workerTypeSummaries: this.awsProvisioner.listWorkerTypeSummaries(),
      invalidAmis: this.props.currentAmiSet ?
        this.awsProvisioner.validateAmiSet(this.props.currentAmiSet) :
        [],
      selectedWorkerTypes: [],
      errorWorkerTypes: [],
      error: null,
    };
  },

  setSelected(selectedWorkerType) {
    this.setState({selected: selectedWorkerType});
  },

  render() {
    if (!this.state.error) {
      return this.props.currentAmiSet ?
        this.renderWaitFor('workerTypeSummaries') || this.renderWorkerTypeTable() :
        (
          <span>Please, first select an AmiSet.</span>
        );
    }

    return (
      <bs.Alert bsStyle="danger" onDismiss={this.dismissError}>
        <strong>Error executing operation</strong>
        <p>
          {this.state.error.toString()}
        </p>
        {
          this.state.errorWorkerTypes.length &&
          (
            <span>
              <p>The AMI set was not applied to the following Worker Types:</p>
              <ul>
                {
                  this.state.errorWorkerTypes.map(workerType => {
                    return (
                      <li key={workerType.workertype}><strong>{workerType.workertype}</strong></li>
                    );
                  })
                }
              </ul>
            </span>
          )
        }
      </bs.Alert>
    );
  },

  renderWorkerTypeTable() {
    const workerTypes = this.state.workerTypeSummaries
      .map(({selectedWorkerType}) => ({value: selectedWorkerType.workerType, label: selectedWorkerType.workerType}));

    return (
      <span>
        <h4>
          Select the worker types to apply <code>{this.props.currentAmiSet}</code>
        </h4>
        <div>
          <Select
            name="form-field-name"
            disabled={this.state.disabled}
            value={this.state.selectedWorkerTypes}
            multi={true}
            options={workerTypes}
            onChange={this.handleSelectChange}
            placeholder="Select workerTypes" />
          <br />
          {this.renderApplyToolbar()}
        </div>
      </span>
    );
  },

  renderApplyToolbar() {
    return (
      <bs.ButtonToolbar>
        <ConfirmAction
          buttonStyle="success"
          glyph="ok"
          label="Apply AMI Sets"
          action={this.applyAmiSet}
          disabled={this.state.invalidAmis.length || !this.state.selectedWorkerTypes.length}
          success="AMI Set applied">
          Apply <code>{this.props.currentAmiSet}</code> to selected Worker Types?
        </ConfirmAction>
      </bs.ButtonToolbar>
    );
  },

  async applyAmiSet() {
    const invalidAmis = await this.awsProvisioner.validateAmiSet(this.props.currentAmiSet);
    this.setState({errorWorkerTypes: []});

    if (!invalidAmis.valid) {
      return this.setState({error: 'This AMI set contains invalid AMIs.'});
    }

    const amiSet = await this.awsProvisioner.amiSet(this.props.currentAmiSet);

    this.state.selectedWorkerTypes.map(async(selectedWorkerType) => {
      var workerType = await this.awsProvisioner.workerType(selectedWorkerType.value);
      var matchedRegions = false;

      amiSet.amis.forEach(ami => {
        workerType.regions.forEach(region => {
          if (ami.region === region.region) {
            matchedRegions = true;
            region.launchSpec.ImageId = ami.hvm;
          }
        });
      });

      if (matchedRegions) {
        try {
          var today = new Date().toJSON().slice(0, 10);
          const updatedDescription = `Updated with AMI set ${this.props.currentAmiSet} on ${today}`;

          if (selectedWorkerType.description.includes('Updated with AMI set')) {
            selectedWorkerType.description = updatedDescription;
          } else {
            selectedWorkerType.description += ` - ${updatedDescription}`;
          }

          // Delete Worker Type name and lastModified fields to make sure it passes
          // the schema validation
          delete workerType.workerType;
          delete workerType.lastModified;

          await this.awsProvisioner.updateWorkerType(selectedWorkerType.value, workerType);
          this.setState({
            error: null,
          });
        } catch (err) {
          this.state.errorWorkerTypes.push({workertype: selectedWorkerType.value});
          this.setState({error: err});
        }
      }
    });
  },
});

// Export WorkerTypeTable
module.exports = WorkerTypeList;
